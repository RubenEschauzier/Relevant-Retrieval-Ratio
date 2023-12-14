import {BindingsStream} from "@comunica/types";
import {Bindings} from "@comunica/bindings-factory";
import {KeysBindingContext} from "@comunica/context-entries";
import {KeysTraversedTopology} from "@comunica/context-entries-link-traversal";
import { ActionContext } from '@comunica/core';
import { TraversedGraph } from "@comunica/actor-construct-traversed-topology-url-to-graph"
import { ISolverOutput, SolverRunner } from "../solver-runner/SolverRunner";
import { MetricOptimalTraversalUnweighted } from "../metric-optimal-traversal-unweighted/MetricOptimalTraversalUnweighted";
import * as fs from 'fs';
import type { Cluster } from 'cluster';

// Steiner tree solver: https://steinlib.zib.de/format.php   -------- https://scipjack.zib.de/#download
// https://github.com/suhastheju/steiner-edge-linear 

class LinkTraversalPerformanceMetrics{
    public engine: any;
    public queryEngine: any;
    public binomialLookUp: number[];
    public solverRunner: SolverRunner;

    public metricOptimalPathUnweighted: MetricOptimalTraversalUnweighted;

    public constructor(){
      this.queryEngine = require("@comunica/query-sparql-link-traversal-solid").QueryEngine;
      this.binomialLookUp = this.preComputeLookUpTable();
      this.solverRunner = new SolverRunner();
      this.metricOptimalPathUnweighted = new MetricOptimalTraversalUnweighted();
    }

    public async createEngine(){
      // this.engine = await new this.queryEngineFactory().create({configPath: "configFiles/config-default-variable-priorities.json"});
      this.engine = new this.queryEngine();
    }

    public readOutputDirFromSettingFile(settingFileLocation: string){
      const data = fs.readFileSync(settingFileLocation, 'utf-8');
      const lineList = data.split("\n");
      for (const line of lineList){
        if (line.startsWith("stp/logfile")){
          const outputLocation = line.match(/"([^"]+)"/)![1];
          return outputLocation
        }
      }
      return "NOFILEFOUND";
    }

    public extractContributingDocuments(bindings: Bindings[]){
      // Extract what documents contributed to each result
      const resultSources: string[][] = [];
      for (let i = 0; i < bindings.length; i++){
          if (bindings[i].context?.get(KeysBindingContext.sourceBinding) == undefined){
              console.error("Result with no source found")
          }   
          resultSources.push(bindings[i].context?.get(KeysBindingContext.sourceBinding)!);
      }
      return resultSources
    }

    public getAllValidCombinations(contributingDocuments: number[], numResults: number): number[][] {
      let head, tail, result = [];

      if ( numResults > contributingDocuments.length || numResults < 1 ) { 
        return []; 
      }

      if ( numResults === contributingDocuments.length ) { 
        return [ contributingDocuments ]; 
      }

      if ( numResults === 1 ) {
        return contributingDocuments.map( element => [ element ] ); 
      }

      for ( let i = 0; i < contributingDocuments.length - numResults + 1; i++ ) {
        head = contributingDocuments.slice( i, i + 1 );
        tail = this.getAllValidCombinations( contributingDocuments.slice( i + 1 ), numResults - 1 );
        for ( let j = 0; j < tail.length; j++ ) { 
          result.push( head.concat( tail[ j ] ) ); 
        }
      }
      return result;
    }

    public preComputeLookUpTable(){
        const size = 1000
        const logf = new Array(size);
        logf[0] = 0;
        for (let i = 1; i <= size; i++){
            logf[i] = logf[i-1] + Math.log(i);
        }
        return logf;
    }

    public getNumValidCombinations(n: number, k: number){
      if (n >= 1000){
          console.error("Can't compute binomial coefficient for n => 1000.")
      }
      return Math.floor(Math.exp(this.binomialLookUp[n] - this.binomialLookUp[n-k] - this.binomialLookUp[k]));
    }

    public async getOptimalPathFirstK(k: number, topology: TraversedGraph, edgeList: number[][], relevantDocuments: string[], 
      optimalTraversalPathAll: number[][], 
      nodeToIndex: Record<string, number>,
      outputDirectedTopology: string,
      solverLocation: string,
      settingFileLocation: string
    ){
      const solverOutputs = [];
      let minFirstKPathLength = Infinity;
      let minSolverOutput: ISolverOutput = {nEdges: Infinity, edges: [], optimalCost: -1};

      const outputLocation = this.readOutputDirFromSettingFile(settingFileLocation);
      const relevantDocumentIndex = relevantDocuments.map(x=>nodeToIndex[x] + 1);

      const numValidCombinations = this.getNumValidCombinations(relevantDocuments.length, k);

      if (numValidCombinations > 1000000){
        console.warn(`INFO: Large number of combinations (${numValidCombinations}) to compute detected.`);
      }

      const combinations = this.getAllValidCombinations(relevantDocumentIndex, k);

      const nodesOptimalPathAll = Array.from(new Set(optimalTraversalPathAll.flat()));
      const nodesFullToReduced: Record<number, number> = {};
      const nodesReducedToFull : Record<number, number> = {};

      let newNodeIndex = 1;
      for (let i = 0; i < nodesOptimalPathAll.length; i++){
        nodesFullToReduced[nodesOptimalPathAll[i]] = newNodeIndex;
        nodesReducedToFull[newNodeIndex] = nodesOptimalPathAll[i];
        newNodeIndex += 1;
      }

      for (const combination of combinations){
        this.solverRunner.writeDirectedTopologyFileReduced(topology, edgeList,
          optimalTraversalPathAll, combination, nodesFullToReduced, "solver/reduced_topology/traversalTopologyReduced.stp");
        await this.solverRunner.runSolver(solverLocation, outputDirectedTopology, settingFileLocation);
        const solverOutput = this.solverRunner.parseSolverResult(outputLocation);
        if (solverOutput.nEdges < minFirstKPathLength){
          minFirstKPathLength = solverOutput.nEdges;
          minSolverOutput = solverOutput
        }
        solverOutputs.push(solverOutput);
      }

      const optimalPathOutput: IOptimalPathFirstK = {
        nEdges: minSolverOutput.nEdges,
        edges: minSolverOutput.edges,
        optimalCost: minSolverOutput.optimalCost,
        nodeReducedToFull: nodesReducedToFull    
      }
      return optimalPathOutput;
    }

    public async getOptimalPathAll(trackedTopology: TraversedGraph, 
      edgeList: number[][],
      relevantDocuments: string[],
      outputDirectedTopology: string,
      solverLocation: string,
      settingFileLocation: string
    ): Promise<ISolverOutput> {
      const outputLocation = this.readOutputDirFromSettingFile(settingFileLocation);
      this.solverRunner.writeDirectedTopologyToFile(trackedTopology, edgeList, 
      relevantDocuments, outputDirectedTopology);
      await this.solverRunner.runSolver(solverLocation, outputDirectedTopology, settingFileLocation);
      return this.solverRunner.parseSolverResult(outputLocation);
    }

    public async runMetricAll(      
      topology: TraversedGraph, 
      relevantDocuments: string[],
      engineTraversalPath: string[], 
      outputDirectedTopology: string,
      solverLocation: string,
      settingFileLocation: string,
      nodeToIndex: Record<string, number>,
      topologyType: topologyType
    ){
      let edgeList = []
      switch (topologyType) {
        case 'unweighted':
          edgeList = topology.getEdgeList();
          break;
        case 'httpRequestTime':
          edgeList = topology.getEdgeListHTTP();
          break;
        case 'documentSize':
          edgeList = topology.getEdgeListDocumentSize();
          break;
      }

      const shortestPath = await runner.getOptimalPathAll(
        topology, 
        edgeList,
        relevantDocuments, 
        outputDirectedTopology, 
        solverLocation,
        settingFileLocation
      );
    
      // Map to index, we do +1 to make nodes 1 indexed like solver expects.
      const engineTraversalPathNodeIndex = engineTraversalPath.map(x=>nodeToIndex[x]+1);
      const relevantDocumentIndex = relevantDocuments.map(x=>nodeToIndex[x] + 1);

      return this.metricOptimalPathUnweighted.getMetricAll(relevantDocumentIndex, 
        engineTraversalPathNodeIndex, shortestPath.edges);
    }

    public async runMetricFirstK(
      k: number, 
      topology: TraversedGraph, 
      relevantDocuments: string[], 
      engineTraversalPath: string[],
      nodeToIndex: Record<string, number>,
      outputDirectedTopology: string,
      solverLocation: string,
      settingFileLocation: string,
      outputDirectedTopologyAllResults: string,
      solverLocationAllResults: string,
      settingFileLocationAllResults: string,
      topologyType: topologyType
    ){
      let edgeList = []
      switch (topologyType) {
        case 'unweighted':
          edgeList = topology.getEdgeList();
          break;
        case 'httpRequestTime':
          edgeList = topology.getEdgeListHTTP();
          break;
        case 'documentSize':
          edgeList = topology.getEdgeListDocumentSize();
          break;
      }

      const solverOutputAllResults = await runner.getOptimalPathAll(
        topology, 
        edgeList,
        relevantDocuments, 
        outputDirectedTopologyAllResults, 
        solverLocationAllResults,
        settingFileLocationAllResults
      );
  
      const shortestPath = await this.getOptimalPathFirstK(
        k, topology, edgeList,
        relevantDocuments, 
        solverOutputAllResults.edges, 
        nodeToIndex,
        outputDirectedTopology,
        solverLocation,
        settingFileLocation
      );

      const engineTraversalPathNodeIndex = engineTraversalPath.map(x=>nodeToIndex[x] + 1);
      const relevantDocumentIndex = relevantDocuments.map(x=>nodeToIndex[x] + 1);
      // Map reduced nodes back to corresponding nodes in full traversed topology
      const shortestPathFirstK = shortestPath.edges.map(x => x.map(y => shortestPath.nodeReducedToFull[y]));

      const metricFirstK = this.metricOptimalPathUnweighted.getMetricFirstK(
        k,
        relevantDocumentIndex, 
        engineTraversalPathNodeIndex, 
        shortestPathFirstK
      );
        
      return metricFirstK;
    }

    public async runUnWeightedMetricFirstK(k: number, topology: TraversedGraph, relevantDocuments: string[], 
      engineTraversalPath: string[],
      nodeToIndex: Record<string, number>,
      outputDirectedTopology: string,
      solverLocation: string,
      settingFileLocation: string,
      outputDirectedTopologyAllResults: string,
      solverLocationAllResults: string,
      settingFileLocationAllResults: string

    ){
      const solverOutputAllResults = await runner.getOptimalPathAll(
      topology, 
      topology.getEdgeList(),
      relevantDocuments, 
      outputDirectedTopologyAllResults, 
      solverLocationAllResults,
      settingFileLocationAllResults
      );

      const shortestPath = await this.getOptimalPathFirstK(
        k, topology, topology.getEdgeList(),
        relevantDocuments, 
        solverOutputAllResults.edges, 
        nodeToIndex,
        outputDirectedTopology,
        solverLocation,
        settingFileLocation
      );

      const engineTraversalPathNodeIndex = engineTraversalPath.map(x=>nodeToIndex[x] + 1);
      const relevantDocumentIndex = relevantDocuments.map(x=>nodeToIndex[x] + 1);


      const metricFirstK = this.metricOptimalPathUnweighted.getMetricAll(relevantDocumentIndex, 
        engineTraversalPathNodeIndex, 
        shortestPath.edges);
      
      return metricFirstK;
    }

    public async consumeStream(bindingStream: BindingsStream, dataProcessingFunction: Function){
        let numResults = 0;
        const bindings: any[] = [];
        const processingResults: any[] = []
        const finishedReading: Promise<any[]> = new Promise((resolve, reject) => {
            bindingStream.on('data', (res: any) => {
                const processingOutput = dataProcessingFunction(res);
                processingResults.push(processingOutput)
                numResults += 1;
                console.log(`Here is data: ${res}`)
                console.log(typeof(res))
            });
            bindingStream.on('end', () =>{
                resolve(processingResults)
            });
            bindingStream.on('error', () =>{
                reject(true)
            });
        });
        return finishedReading
   }
}

class linkTraversalTopologyTracker{
  public engine: any;
  public queryEngine: any;

  public constructor(){
    this.queryEngine = require("@comunica/query-sparql-link-traversal-solid").QueryEngine;
  }

  public async createEngine(){
    this.engine = new this.queryEngine();
  }

  public runWorker(){

  }

  public runMaster(){
    
  }

}
const query = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
SELECT ?messageId ?messageCreationDate ?messageContent WHERE {
  ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000000000000000933/profile/card#me>;
    rdf:type snvoc:Post;
    snvoc:content ?messageContent;
    snvoc:creationDate ?messageCreationDate;
    snvoc:id ?messageId.
} `;
const discover_6_1 = `PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
SELECT DISTINCT ?forumId ?forumTitle WHERE {
  ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000000000000000933/profile/card#me>.
  ?forum snvoc:containerOf ?message;
    snvoc:id ?forumId;
    snvoc:title ?forumTitle.
}`

const discover_8_5 = `PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
SELECT DISTINCT ?creator ?messageContent WHERE {
  <https://solidbench.linkeddatafragments.org/pods/00000006597069767117/profile/card#me> snvoc:likes _:g_0.
  _:g_0 (snvoc:hasPost|snvoc:hasComment) ?message.
  ?message snvoc:hasCreator ?creator.
  ?otherMessage snvoc:hasCreator ?creator;
    snvoc:content ?messageContent.
}
LIMIT 10`

const discover_3_5 = `PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?tagName (COUNT(?message) AS ?messages) WHERE {
  ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000006597069767117/profile/card#me>;
    snvoc:hasTag ?tag.
  ?tag foaf:name ?tagName.
}
GROUP BY ?tagName
ORDER BY DESC (?messages)`


const discover_4_5 = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?locationName (COUNT(?message) AS ?messages) WHERE {
  ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000006597069767117/profile/card#me>;
    rdf:type snvoc:Comment;
    snvoc:isLocatedIn ?location.
  ?location foaf:name ?locationName.
}
GROUP BY ?locationName
ORDER BY DESC (?messages)`

const runner = new LinkTraversalPerformanceMetrics();
runner.createEngine().then(async () => {
    const queryOutput = await runner.engine.query(query, {idp: "void", 
    "@comunica/bus-rdf-resolve-hypermedia-links:annotateSources": "graph", unionDefaultGraph: true, lenient: true, constructTopology: true});
    const bindingStream = await queryOutput.execute();
    const mediatorConstructTraversedTopology = await queryOutput.context.get(KeysTraversedTopology.mediatorConstructTraversedTopology);
    // This returns an object with the topology object in it, this will contain the topology after executing the query
    const constuctTopologyOutput = await mediatorConstructTraversedTopology.mediate(
      {
        parentUrl: "",
        links: [],
        metadata: [{}],
        setDereferenced: false,
        context: new ActionContext()
    });
    // Execute entire query, should be a promise with timeout though
    const bindings: Bindings[] = await bindingStream.toArray();
    const contributingDocuments = runner.extractContributingDocuments(bindings);
    // console.log(contributingDocuments)

    // const metricUnweightedAll = await runner.runMetricAll(
    //   constuctTopologyOutput.topology,
    //   contributingDocuments.flat(), 
    //   constuctTopologyOutput.topology.traversalOrder,
    //   "solver/full_topology/traversalTopology.stp", 
    //   "solver/scipstp",
    //   "solver/full_topology/write.set",
    //   constuctTopologyOutput.topology.nodeToIndex,
    //   "unweighted"
    // );

    const k = 3
    // const metricUnweightedFirstK = await runner.runUnWeightedMetricFirstK(
    //   k, constuctTopologyOutput.topology, contributingDocuments.flat(),
    //   constuctTopologyOutput.topology.traversalOrder, 
    //   constuctTopologyOutput.topology.nodeToIndex,
    //   "solver/reduced_topology/traversalTopologyReduced.stp", 
    //   "solver/scipstp",
    //   "solver/reduced_topology/write.set",
    //   "solver/full_topology/traversalTopology.stp", 
    //   "solver/scipstp",
    //   "solver/full_topology/write.set"
    // );
    // console.log(`Metric unweighted first ${k}: ${metricUnweightedFirstK}`);

    const test = await runner.runMetricFirstK(
      k, constuctTopologyOutput.topology, contributingDocuments.flat(),
      constuctTopologyOutput.topology.traversalOrder, 
      constuctTopologyOutput.topology.nodeToIndex,
      "solver/reduced_topology/traversalTopologyReduced.stp", 
      "solver/scipstp",
      "solver/reduced_topology/write.set",
      "solver/full_topology/traversalTopology.stp", 
      "solver/scipstp",
      "solver/full_topology/write.set",
      "unweighted"
    );
    console.log(`Metric unweighted first ${k}: ${test}`);

    // const metricHTTPWeightedAll = await runner.runMetricAll(
    //   constuctTopologyOutput.topology,
    //   contributingDocuments.flat(), 
    //   constuctTopologyOutput.topology.traversalOrder,
    //   "solver/full_topology/traversalTopology.stp", 
    //   "solver/scipstp",
    //   "solver/full_topology/write.set",
    //   constuctTopologyOutput.topology.nodeToIndex,
    //   "httpRequestTime"
    // );

    // const metricDocumentSizeWeightedAll= await runner.runMetricAll(
    //   constuctTopologyOutput.topology,
    //   contributingDocuments.flat(), 
    //   constuctTopologyOutput.topology.traversalOrder,
    //   "solver/full_topology/traversalTopology.stp", 
    //   "solver/scipstp",
    //   "solver/full_topology/write.set",
    //   constuctTopologyOutput.topology.nodeToIndex,
    //   "documentSize"
    // );



    // TODO: Create one function that can run the different metric types by choosing a parameter value .
    // TODO: First $k$ results time for different metric weights .
    // TODO: Think about when multiple documents are needed for 1 result, we don't deal with that properly now as each document will be treated 
    // as seperate result.
    // TODO: Metric needs to be: we follow this many times more links than needed (simple division tbh)

    // TODO: Add timeout for queries
    // TODO: Handle queries that have no results, can we use unfragmented dataset?
    // TODO: Create big experiment runner for all queries

    // ----
    // TODO: Implement algorithms Olaf
});

export interface IOptimalPathFirstK extends ISolverOutput{
  nodeReducedToFull: Record<number, number>;
}

export type topologyType = "unweighted" | "httpRequestTime" | "documentSize"