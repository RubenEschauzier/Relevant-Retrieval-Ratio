import { BindingsStream } from "@comunica/types";
import { Bindings } from "@comunica/bindings-factory";
import { KeysBindingContext } from "@comunica/context-entries";
import { ActionContext } from "@comunica/core";
import { KeysTraversedTopology } from "@comunica/context-entries-link-traversal";
import { TraversedGraph } from "@comunica/actor-construct-traversed-topology-url-to-graph"
import {RunLinkTraversalPerformanceMetrics, topologyType, IMetricInput, searchType} from "../run-link-traversal-performance-metrics/RunLinkTraversalPerformanceMetrics"
import * as path from 'path';
import * as fs from "fs";


export class runWithComunica{
    public engine: any;
    public queryEngineFactory: any;
    public binomialLookUp: number[];

    public constructor(){
      this.queryEngineFactory = require("@comunica/query-sparql-link-traversal-solid").QueryEngineFactory;
    }

    public async createEngine(){
      // this.engine = await new this.queryEngineFactory().create({configPath: "configFiles/config-default-variable-priorities.json"});
      this.engine = await new this.queryEngineFactory().create();
    }

    public async runQuery(query: string){
      const queryOutput = await comunicaRunner.engine.query(query, 
        {
        idp: "void", 
        "@comunica/bus-rdf-resolve-hypermedia-links:annotateSources": "graph", 
        unionDefaultGraph: true, 
        lenient: true, 
        constructTopology: true
      });
      const bindingStream = await queryOutput.execute();
      // This returns an object with the topology object in it, this will contain the topology after executing the query
      // Execute entire query, should be a promise with timeout though
      const bindings: Bindings[] = await bindingStream.toArray();
      console.log(bindings.length);
    }

    public readQueries(location: string){
      const queries: string[][] = []
      for (const dir of fs.readdirSync(location)){
        const data = fs.readFileSync(path.join(location, dir), 'utf8');
        const queriesSplit = data.split('\n\n');
        queries.push(queriesSplit);
      }
      return queries;
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

    public convertZeroIndexedToOneIndexed(edgeList: number[][]){
      return edgeList.map(x=>[x[0]+1, x[1]+1, x[2] ? x[2] : 1]);
    }

    public prepareMetricInput(trackedTopology: TraversedGraph, contributingDocuments: string[][], metricType: topologyType): IMetricInput{
      let edgeList = []
      switch (metricType) {
        case 'unweighted':
          edgeList = trackedTopology.getEdgeList();
          break;
        case 'httpRequestTime':
          edgeList = trackedTopology.getEdgeListHTTP();
          break;
        case 'documentSize':
          edgeList = trackedTopology.getEdgeListDocumentSize();
          break;
      }
      edgeList = this.convertZeroIndexedToOneIndexed(edgeList);

      // Convert string representations of relevant documents to one indexed list

      const relevantDocsOneIndexed = contributingDocuments.map(x=>x.map(y=>trackedTopology.getNodeToIndex()[y]+1));

      const traversalPath = trackedTopology.getTraversalOrderEdges();
      const traversalPathOneIndexed = this.convertZeroIndexedToOneIndexed(traversalPath);
    
      const nodeMetaData = trackedTopology.getMetaDataAll();

      const roots = [];
      // Iterate over zero indexed metadata to find nodes with no parent node to find root nodes
      for (let k = 0; k < nodeMetaData.length; k++){
        if (!nodeMetaData[k].hasParent){
          // Convert to one indexed
          roots.push(k+1);
        }
      }

      return {
        edgeList: edgeList, 
        contributingNodes: relevantDocsOneIndexed, 
        traversedPath: traversalPathOneIndexed, 
        numNodes: nodeMetaData.length,
        roots: roots
      };
    }

    public async getMetricAllQueries(
      queries: string[], 
      metricType: topologyType,
      searchType: searchType, 
      solverFileLocationBase: string, 
      kToTest: number[] = [], 
      log: boolean = true,
      logLocation: string = path.join(__dirname, "..", "..", "log")
      ){
      const metricResults: IQueriesMetricResults[] = [];
      for (let i = 0; i < queries.length; i++){
        await this.createEngine();
        console.log(`Calculating metric ${i+1}/${queries.length}`);
        // await this.runQuery(queries[i])
        const metricInput: IMetricInput = await comunicaRunner.getMetricInputOfQuery(
          queries[i], 
          i,
          metricType,
          log,
          logLocation
        );
        if (metricInput.contributingNodes.length > 0){
          const metricAll = await comunicaRunner.calculateMetricAll(metricInput, 
            path.join(solverFileLocationBase, "input-file.stp"));
          const metricsFirstK: Record<number, number> = {};
          for (const k of kToTest){
            // Check if we have enough results to calculate first k metric
            if (metricInput.contributingNodes.length > k){
              const metricUnweightedFirstK = await comunicaRunner.calculateMetricFirstK(metricInput, k, 
                path.join(solverFileLocationBase, "input-file.stp"), searchType); 
              metricsFirstK[k] = metricUnweightedFirstK;   
            }
          }
          metricResults.push({query: queries[i], nResults: metricInput.contributingNodes.length, 
            metricAll: metricAll, metricsFirstK: metricsFirstK}
          );  
        }
        else{
          // No results means no useful metric
          metricResults.push({query: queries[i], nResults: metricInput.contributingNodes.length, 
            metricAll: 0, metricsFirstK: [0,0,0]});
        }

        const pathLog = path.join(__dirname, "..", "..", "log", "calculationLog.txt");
        fs.writeFileSync(pathLog, JSON.stringify(metricResults));
        console.log(metricResults)
      }
    }

    public async getMetricInputOfQuery(
      query: string, 
      queryId: number, 
      metricType: topologyType, 
      logCalculations: boolean, 
      logLocation: string
    ){
      const queryOutput = await comunicaRunner.engine.query(query, 
        {
        idp: "void", 
        "@comunica/bus-rdf-resolve-hypermedia-links:annotateSources": "graph", 
        unionDefaultGraph: true, 
        lenient: true, 
        constructTopology: true
      });
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
      console.log(bindings.length);

      // This is tied to Comunica, for metric usage with other engine you have to implement this yourself (if the contributing
      // documents are stored differently)
      const contributingDocuments = comunicaRunner.extractContributingDocuments(bindings);
      console.log(contributingDocuments);
      const metricInput: IMetricInput = comunicaRunner.prepareMetricInput(
        constuctTopologyOutput.topology, 
        contributingDocuments, 
        metricType
      ); 

      // Log the constructed topology
      if (logCalculations) {
        fs.writeFileSync(path.join(logLocation, `topologyQuery${queryId}.txt`), JSON.stringify(constuctTopologyOutput.topology))
        fs.writeFileSync(path.join(logLocation, `metricInput${queryId}.txt`), JSON.stringify(metricInput));
      }     

      // Reset topology for next query execution
      constuctTopologyOutput.topology.resetTopology();
    return metricInput;
  }

  public async calculateMetricAll(metricInput: IMetricInput, solverInputFileLocation: string){
    const metricAll = await metric.runMetricAll(
      metricInput.edgeList, 
      metricInput.contributingNodes, 
      metricInput.traversedPath, 
      metricInput.roots,
      metricInput.numNodes,
      solverInputFileLocation
    );
    return metricAll;
  }

  public async calculateMetricFirstK(metricInput: IMetricInput, k: number, solverInputFileLocation: string, searchType: searchType){
    const metricFirstK = await metric.runMetricFirstK(
      k,
      metricInput.edgeList, 
      metricInput.contributingNodes, 
      metricInput.traversedPath, 
      metricInput.roots,
      metricInput.numNodes,
      solverInputFileLocation,
      searchType
    );
    return metricFirstK
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

// How to deal with timeouts on queries / queries that take too much data?

const comunicaRunner = new runWithComunica();
const metric = new RunLinkTraversalPerformanceMetrics();
comunicaRunner.createEngine().then(async () => {
  const solverFileLocationBase = path.join(__dirname, "..", "..", "heuristic-solver", "input", "full_topology");
  const queryLocation = path.join(__dirname, "..", "..", "data", "queriesLocal");
  const allQueries = comunicaRunner.readQueries(queryLocation).flat().slice(0,1);
  await comunicaRunner.getMetricAllQueries(
    allQueries, 
    'unweighted',
    "reduced", 
    solverFileLocationBase, 
    [1, 2, 4]
    );
});

export interface IQueriesMetricResults{
  query: string
  /**
   * Num results in query
   */
  nResults: number;
  /**
   * Metric for all results
   */
  metricAll: number
  /**
   * All results of first k result metric, key: k , value: metric
   */
  metricsFirstK: Record<number, number>
}