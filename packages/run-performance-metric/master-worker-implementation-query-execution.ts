import {BindingsStream} from "@comunica/types";
import {Bindings} from "@comunica/bindings-factory";
import {KeysBindingContext} from "@comunica/context-entries";
import * as fs from 'fs';
import * as path from 'path';
import cluster from "cluster";
// const cluster = require('node:cluster');

class linkTraversalTopologyTracker{
    public engine: any;
    public queryEngine: any;
    public timeout: number;
  
    public constructor(timeout: number){
      this.queryEngine = require("@comunica/query-sparql-link-traversal-solid").QueryEngine;
      this.timeout = timeout;
    }
  
    public run(queryDir: string){
      if (cluster.isPrimary){
        this.runMaster(queryDir)
        return;
      }
      this.runWorker();
      return;
    }
  
    public async runWorker(){
      await this.createEngine();
  
      process.on('message', async (message: string): Promise<void> => {
        const messageJSON = JSON.parse(JSON.stringify(message));
        const queries = messageJSON.querySet.queries;
        console.log(`Worker start query ${queries[messageJSON.i][messageJSON.j]} `)
  
        // Declare i,j for iterating before the loop so we can send it on shutdown message
        let i: number;
        let j: number;
        let contributingDocuments: string[][] = [];
        // SUPER UGLY?
        let blockShutdown = false;
  
        // If we get shutdown message (due to timeout) we return whatever we have filled the contributingDocuments
        // with so far. Do this at start to prevent multiple .on('message' == 'shutdown') calls 
        process.on('message', async (message: string) => {
          if (message === 'shutdown'){
            console.log(`Receive shutdown message`);
            while (blockShutdown){
              console.log("Blocking shutdown");
              await this.sleep(10);
            }
            process.send!({contributingDocuments: contributingDocuments, i: i, j: j});
            console.log("SENT")
          }
          console.log("Exiting")
          process.exit(15);
        });
    
        for (i = messageJSON.i; i < queries.length; i++){
          console.log(`Query format ${i+1}/${queries.length}`);
          // Start where we left-off before any worker shutdown due to timeout
          for (j = messageJSON.j; j < queries[i].length; j++){
            // After we've increased i,j to show we sent a new result we can safely shutdown the worker after timeout.
            blockShutdown = false;
            contributingDocuments = [];
  
            const queryOutput = await this.engine.query(queries[i][j], 
              { idp: "void", 
                "@comunica/bus-rdf-resolve-hypermedia-links:annotateSources": "graph", 
                unionDefaultGraph: true, 
                lenient: true, 
                constructTopology: true
            });
            const bindingStream = await queryOutput.execute();
            // This fills the contributingDocuments with results from query. By (ab)using pass by reference we can send this
            // on timeout
            await this.consumeStreamWorker(bindingStream, contributingDocuments);
            // If we timeout while trying to send a complete result, this could result in race conditions
            blockShutdown = true;
            process.send!({contributingDocuments: contributingDocuments, i: i, j: j});
          }
          // Now we want to start inner loop at j = 0
          j = 0;
        }
        // Send sentinel message that we've completed all queries
        process.send!('EOQ');
        process.exit(0);
  
  
        // const mediatorConstructTraversedTopology = await queryOutput.context.get(KeysTraversedTopology.mediatorConstructTraversedTopology);
        // // This returns an object with the topology object in it, this will contain the topology after executing the query
        // const constuctTopologyOutput = await mediatorConstructTraversedTopology.mediate(
        //   {
        //     parentUrl: "",
        //     links: [],
        //     metadata: [{}],
        //     setDereferenced: false,
        //     context: new ActionContext()
        // });
  
      });
    }
  
    public async runMaster(queryDir: string){
      const querySet = this.readQueries(queryDir);
  
      // Create child process that will run the query (with timeout)
      let worker = cluster.fork();
      let i = 0; const maxI = querySet.queries.length;
      let j = 0; const maxJ = querySet.queries[0].length;
  
      worker.send({querySet: querySet, i: i, j: j});
      let timerID = setTimeout(() => {
        console.log("Timeout reached between results, shutting down worker");
        worker.send('shutdown'); 
        worker.once("exit" , async (code, signal) => {
          worker = cluster.fork();
          const receiveOutput = new Promise( (resolve) => {
            worker.on("message", (message) => {
              console.log(`Master received message from worker: ${JSON.stringify(message)}`);
              // Might need to be j += 1 or i += 0 and j = 0
              if (message.j == maxJ - 1){
                i = message.i += 1;
                j = 0;
              }
              else{
                i = message.i;
                j = message.j + 1;  
              }
              console.log(i, j);
      
              if (message == 'EOQ'){
                resolve(true);
              }
            })
          });
          await receiveOutput;
      
          worker.send({querySet: querySet, i: i, j: j});
          timerID.refresh();
        }); 
      }, 2000);
      
      const receiveOutput = new Promise( (resolve) => {
        worker.on("message", (message) => {
          console.log(`Master received message from worker: ${JSON.stringify(message)}`);
          // Might need to be j += 1 or i += 0 and j = 0
          if (message.j == maxJ - 1){
            i = message.i += 1;
            j = 0;
          }
          else{
            i = message.i;
            j = message.j + 1;  
          }
          console.log(i, j);
  
          if (message == 'EOQ'){
            resolve(true);
          }
        })
      });
      await receiveOutput;
  
      worker.kill();
    }
  
    public async createEngine(){
      this.engine = new this.queryEngine();
    }
  
    public readQueries(queryDir: string): IQuerySet{
      const queryFiles = fs.readdirSync(queryDir);
      const queryNames: string[] = [];
      const queries: string[][] = [];
  
      for (const file of queryFiles){
        const data = fs.readFileSync(path.join(__dirname, "..", "..", queryDir, file), 'utf-8');
        const splitQueries = data.split("\n\n");
        queryNames.push(file);
        queries.push(splitQueries);
      }
      return {
        queries: queries,
        queryNames: queryNames
      }
    }
  
    public consumeStreamWorker(bindingStream: BindingsStream, contributingDocuments: string[][]){
      const finishedReading: Promise<string[][]> = new Promise((resolve, reject) => {
          bindingStream.on('data', (res: any) => {
              console.log('data');
              const contributingDocumentsBinding = this.extractContributingDocuments(res);
              contributingDocuments.push(contributingDocumentsBinding);
          });
          bindingStream.on('end', () =>{
              resolve(contributingDocuments)
          });
          bindingStream.on('error', () =>{
              reject(false)
          });
      });
  
      return finishedReading
    }
  
    public extractContributingDocuments(binding: Bindings): string[] {
      // Extract what documents contributed to each result
      const resultSources: string[] = [];
      if (binding.context?.get(KeysBindingContext.sourceBinding) == undefined){
          console.error("Result with no source found")
      }       
      return binding.context?.get(KeysBindingContext.sourceBinding)!;
    }
  
    public async sleep(ms: number){
      return new Promise(resolve => setTimeout(resolve, ms))
    }
  }
  

const queryExecution = new linkTraversalTopologyTracker(1000)
queryExecution.run("data/queries");


export interface IQuerySet{
    queries: string[][];
    queryNames: string[];
  }
  