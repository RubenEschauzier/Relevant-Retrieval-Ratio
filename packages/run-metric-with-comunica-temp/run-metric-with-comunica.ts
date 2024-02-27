import { BindingsStream } from "@comunica/types";
import { Bindings } from "@comunica/bindings-factory";
import { KeysBindingContext } from "@comunica/context-entries";
import { ActionContext } from "@comunica/core";
import { KeysTraversedTopology } from "@comunica/context-entries-link-traversal";
import { TraversedGraph } from "@comunica/actor-construct-traversed-topology-url-to-graph"
import { ISolverOutput, SolverRunner } from "../solver-runner/SolverRunner";
import { MetricOptimalTraversalUnweighted } from "../metric-optimal-traversal-unweighted/MetricOptimalTraversalUnweighted";
import * as fs from 'fs';
import {LinkTraversalPerformanceMetrics} from "../run-performance-metric/run-metric-traversal-efficiency"

export class runWithComunica{
    public engine: any;
    public queryEngine: any;
    public binomialLookUp: number[];
    public solverRunner: SolverRunner;

    public metricOptimalPathUnweighted: MetricOptimalTraversalUnweighted;

    public constructor(){
      this.queryEngine = require("@comunica/query-sparql-link-traversal-solid").QueryEngine;
    }

    public async createEngine(){
      // this.engine = await new this.queryEngineFactory().create({configPath: "configFiles/config-default-variable-priorities.json"});
      this.engine = new this.queryEngine();
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

      const relevantDocsOneIndexed = contributingDocuments.map(x=>x.map(y=>trackedTopology.getNodeToIndexes()[y]+1));

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
const comunicaRunner = new runWithComunica();
const metric = new LinkTraversalPerformanceMetrics();
comunicaRunner.createEngine().then(async () => {
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

  // This is tied to Comunica, for metric usage with other engine you have to implement this yourself (if the contributing
  // documents are stored differently)
  const contributingDocuments = comunicaRunner.extractContributingDocuments(bindings);
  // Simulate a result that needs 2 documents.
  contributingDocuments[0].push(`https://solidbench.linkeddatafragments.org/pods/00000000000000000933/posts/2010-08-06`);
  const metricInputUnweighted = comunicaRunner.prepareMetricInput(constuctTopologyOutput.topology, contributingDocuments, "unweighted");
  const metricAllUnweighted = await metric.runMetricAllTest(
    metricInputUnweighted.edgeList, 
    metricInputUnweighted.contributingNodes, 
    metricInputUnweighted.traversedPath, 
    metricInputUnweighted.roots,
    metricInputUnweighted.numNodes,
    "/home/reschauz/projects/experiments-comunica/comunica-experiment-performance-metric/heuristic-solver/input/full_topology/input-file.stp"
  );
  console.log(`Metric unweighted all documents: ${metricAllUnweighted}`);
  // const edgeList = constuctTopologyOutput.topology.getEdgeList();
  // console.log(edgeList);

  // const metricUnweightedAll = await metric.runMetricAll(
  //   constuctTopologyOutput.topology,
  //   contributingDocuments.flat(), 
  //   constuctTopologyOutput.topology.getTraversalOrderEdges(),
  //   "solver/full_topology/traversalTopology.stp", 
  //   "solver/scipstp",
  //   "solver/full_topology/write.set",
  //   constuctTopologyOutput.topology.nodeToIndex,
  //   "unweighted"
  // );

})
// runner.createEngine().then(async () => {
//     const queryOutput = await runner.engine.query(query, {idp: "void", 
//     "@comunica/bus-rdf-resolve-hypermedia-links:annotateSources": "graph", unionDefaultGraph: true, lenient: true, constructTopology: true});
//     const bindingStream = await queryOutput.execute();
//     const mediatorConstructTraversedTopology = await queryOutput.context.get(KeysTraversedTopology.mediatorConstructTraversedTopology);
//     // This returns an object with the topology object in it, this will contain the topology after executing the query
//     const constuctTopologyOutput = await mediatorConstructTraversedTopology.mediate(
//       {
//         parentUrl: "",
//         links: [],
//         metadata: [{}],
//         setDereferenced: false,
//         context: new ActionContext()
//     });
//     // Execute entire query, should be a promise with timeout though
//     const bindings: Bindings[] = await bindingStream.toArray();
//     const contributingDocuments = runner.extractContributingDocuments(bindings);
//     // Simulate a result that needs 2 documents.
//     contributingDocuments[0].push(`https://solidbench.linkeddatafragments.org/pods/00000000000000000933/posts/2010-08-06`);





//     console.log(contributingDocuments);
//     console.log(constuctTopologyOutput.topology);
//     const metricUnweightedAll = await runner.runMetricAll(
//       constuctTopologyOutput.topology,
//       contributingDocuments.flat(), 
//       constuctTopologyOutput.topology.getTraversalOrderEdges(),
//       "solver/full_topology/traversalTopology.stp", 
//       "solver/scipstp",
//       "solver/full_topology/write.set",
//       constuctTopologyOutput.topology.nodeToIndex,
//       "unweighted"
//     );

//     const k = 3

//     const test = await runner.runMetricFirstK(
//       k, 
//       constuctTopologyOutput.topology, 
//       contributingDocuments,
//       constuctTopologyOutput.topology.getTraversalOrderEdges(), 
//       constuctTopologyOutput.topology.nodeToIndex,
//       "solver/reduced_topology/traversalTopologyReduced.stp", 
//       "solver/scipstp",
//       "solver/reduced_topology/write.set",
//       "solver/full_topology/traversalTopology.stp", 
//       "solver/scipstp",
//       "solver/full_topology/write.set",
//       "documentSize"
//     );
//     console.log(`Metric unweighted first ${k}: ${test}`);

//     const metricHTTPWeightedAll = await runner.runMetricAll(
//       constuctTopologyOutput.topology,
//       contributingDocuments.flat(), 
//       constuctTopologyOutput.topology.traversalOrder,
//       "solver/full_topology/traversalTopology.stp", 
//       "solver/scipstp",
//       "solver/full_topology/write.set",
//       constuctTopologyOutput.topology.nodeToIndex,
//       "httpRequestTime"
//     );

//     const metricDocumentSizeWeightedAll= await runner.runMetricAll(
//       constuctTopologyOutput.topology,
//       contributingDocuments.flat(), 
//       constuctTopologyOutput.topology.traversalOrder,
//       "solver/full_topology/traversalTopology.stp", 
//       "solver/scipstp",
//       "solver/full_topology/write.set",
//       constuctTopologyOutput.topology.nodeToIndex,
//       "documentSize"
//     );



//     // TODO: Create one function that can run the different metric types by choosing a parameter value .
//     // TODO: First $k$ results time for different metric weights .
//     // TODO: Think about when multiple documents are needed for 1 result, we don't deal with that properly now as each document will be treated 
//     // as seperate result
//     // TODO: Metric needs to be: we follow this many times more links than needed (simple division tbh) .

//     // TODO: Add timeout for queries
//     // TODO: Handle queries that have no results, can we use unfragmented dataset?
//     // TODO: Create big experiment runner for all queries

//     // ----
//     // TODO: Implement algorithms Olaf
// });

export interface IOptimalPathFirstK extends ISolverOutput{
  nodeReducedToFull: Record<number, number>;
}


export interface IMetricInput {
  // 1 indexed edge list
  edgeList: number[][];

  // 1 indexed contributing documents list
  contributingNodes: number[][];

  // Engine traversal path
  traversedPath: number[][];

  // number of nodes in topology
  numNodes: number;

  // 1 indexed roots
  roots: number[];

}

export type topologyType = "unweighted" | "httpRequestTime" | "documentSize"