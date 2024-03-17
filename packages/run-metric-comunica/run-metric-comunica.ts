import { BindingsStream } from "@comunica/types";
import { Bindings } from "@comunica/bindings-factory";
import { KeysBindingContext } from "@comunica/context-entries";
import { ActionContext } from "@comunica/core";
import { KeysTraversedTopology } from "@comunica/context-entries-link-traversal";
import { TraversedGraph } from "@comunica/actor-construct-traversed-topology-url-to-graph"
import {LinkTraversalPerformanceMetrics, topologyType, IMetricInput, searchType} from "../run-performance-metric/run-metric-traversal-efficiency"
import * as path from 'path';
import * as fs from "fs";


export class runWithComunica{
    public engine: any;
    public queryEngine: any;
    public binomialLookUp: number[];

    public constructor(){
      this.queryEngine = require("@comunica/query-sparql-link-traversal-solid").QueryEngine;
    }

    public async createEngine(){
      // this.engine = await new this.queryEngineFactory().create({configPath: "configFiles/config-default-variable-priorities.json"});
      this.engine = new this.queryEngine();
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

    public async getMetricAllQueries(queries: string[], metricType: topologyType, solverFileLocationBase: string, kToTest: number[] = []){
      const metricResults: IQueriesMetricResults[] = [];
      for (let i = 0; i < queries.length; i++){
        console.log(`Calculating metric ${i+1}/${queries.length}`);
        const metricInput: IMetricInput = await comunicaRunner.getMetricInputOfQuery(
          queries[i], 
          metricType,
        );
        console.log(metricInput)
      
        const metricAll = await comunicaRunner.calculateMetricAll(metricInput, 
          path.join(solverFileLocationBase, "input-file.stp"));
        const metricsFirstK: Record<number, number> = {};

        for (const k of kToTest){
          // Check if we have enough results to calculate first k metric
          if (metricInput.contributingNodes.length > k){
            const metricUnweightedFirstK = await comunicaRunner.calculateMetricFirstK(metricInput, k, 
              path.join(solverFileLocationBase, "input-file.stp"), "full"); 
            metricsFirstK[k] = metricUnweightedFirstK;   
          }
        }
        metricResults.push({query: queries[i], nResults: metricInput.contributingNodes.length, 
          metricAll: metricAll, metricsFirstK: metricsFirstK}
        );
        const pathLog = path.join(__dirname, "..", "..", "log", "calculationLog.txt");
        fs.writeFileSync(pathLog, JSON.stringify(metricResults));
      }
    }
    public async getMetricInputOfQuery(query: string, metricType: topologyType){
      console.log(query)
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
      const numResults = bindings.length;
      console.log(numResults);

      // This is tied to Comunica, for metric usage with other engine you have to implement this yourself (if the contributing
      // documents are stored differently)
      const contributingDocuments = comunicaRunner.extractContributingDocuments(bindings);
    
      const metricInput = comunicaRunner.prepareMetricInput(
        constuctTopologyOutput.topology, 
        contributingDocuments, 
        metricType
      );      
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

const comunicaRunner = new runWithComunica();
const metric = new LinkTraversalPerformanceMetrics();
comunicaRunner.createEngine().then(async () => {
  const solverFileLocationBase = path.join(__dirname, "..", "..", "heuristic-solver", "input", "full_topology");
  const queryLocation = path.join(__dirname, "..", "..", "data", "queries");
  const allQueries = comunicaRunner.readQueries(queryLocation).flat();
  // const metricInput: IMetricInput = await comunicaRunner.getMetricInputOfQuery(
  //   query, 
  //   "unweighted",
  // );

  // const metricUnweightedAll = await comunicaRunner.calculateMetricAll(metricInput, 
  //   path.join(solverFileLocationBase, "input-file.stp"));
  // const metricUnweightedFirstK = await comunicaRunner.calculateMetricFirstK(metricInput, 3, 
  //   path.join(solverFileLocationBase, "input-file.stp"), "full");
  // console.log(metricUnweightedAll);
  // console.log(metricUnweightedFirstK);
  await comunicaRunner.getMetricAllQueries(allQueries, 'unweighted', solverFileLocationBase, [1, 2, 4]);
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