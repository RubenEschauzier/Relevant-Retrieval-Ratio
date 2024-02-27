import { BindingsStream } from "@comunica/types";
import { Bindings } from "@comunica/bindings-factory";
import { KeysBindingContext } from "@comunica/context-entries";
import { TraversedGraph } from "@comunica/actor-construct-traversed-topology-url-to-graph"
import { ISolverOutput, SolverRunner } from "../solver-runner/SolverRunner";
import { MetricOptimalTraversalUnweighted } from "../metric-optimal-traversal-unweighted/MetricOptimalTraversalUnweighted";
import * as fs from 'fs';
import * as path from 'path';

// Steiner tree solver: https://steinlib.zib.de/format.php   -------- https://scipjack.zib.de/#download
// https://github.com/suhastheju/steiner-edge-linear 

export class LinkTraversalPerformanceMetrics{
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

    public getAllValidCombinations(contributingDocuments: number[][], numResults: number): number[][][] {
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

    public async getOptimalPathFirstK(k: number, topology: TraversedGraph, edgeList: number[][], relevantDocuments: string[][], 
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
      const relevantDocumentIndex = relevantDocuments.map(x=>x.map(y => nodeToIndex[y] + 1));

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
        console.log(combination);
        this.solverRunner.writeDirectedTopologyFileReduced(topology, edgeList,
          optimalTraversalPathAll, combination.flat(1), nodesFullToReduced, "solver/reduced_topology/traversalTopologyReduced.stp");
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
    
    public async getOptimalPathFirstKTest(){

    }
    /**
     * Calculates the optimal path to take to traverse all terminal nodes in the graph. Note this implementation uses a heuristic
     * It is not guaranteed to be optimal.
     * @param edgeList 
     * @param relevantDocuments 
     * @param engineTraversalPath 
     * @param rootDocuments 
     * @param solverInputFileLocation 
     */
    public async getOptimalPathAllTest(
      edgeList: number[][],
      relevantDocuments: number[][],
      engineTraversalPath: number[][],
      rootDocuments: number[],
      numNodes: number,
      solverInputFileLocation: string,
      
    ){
      // Write traversal information to .stp file that serves as input to steiner tree solvers. Such format is used by various
      // solvers. 
      this.solverRunner.writeDirectedTopologyToFileTest(
        edgeList,
        relevantDocuments,
        rootDocuments, 
        numNodes,
        solverInputFileLocation
      );
      const splitPath = solverInputFileLocation.split('/');

      // We get sub-directory that the directed topology file is saved in
      const inputDirectoryForSolver = splitPath.slice(splitPath.length - 2, splitPath.length - 1) + "/";
      // Get absolute path to parent-directory of directory topology file is saved in
      const parentDirectoryInputDirectory = splitPath.slice(0, splitPath.length - 2).join('/')+"/";
      // Absolute path to the directory for code of the heuristic solver
      const heuristicSolverPath = path.join(__dirname, "..", "..", "heuristic-solver", "src");

      const stdout = await this.solverRunner.runSolverHeuristic(
        heuristicSolverPath, 
        parentDirectoryInputDirectory, 
        inputDirectoryForSolver
      );

      const solverOutput = this.solverRunner.parseSolverResultHeuristic(stdout);
      // Attach the cost back to the solution, as the solver doesn't report it
      const solverOutputWithCost = this.attachCostToSolverOutput(solverOutput, edgeList);

      return solverOutputWithCost
    }

    /**
    * Re-attaches cost to solver output and calculates total path cost. Returns the changed object
    * @param optimizerOutput 
    * @param edgeList 
    * @returns 
    */
    public attachCostToSolverOutput(optimizerOutput: ISolverOutput, edgeList: number[][]){
      const solverOutputWithCost: ISolverOutput = {nEdges: optimizerOutput.nEdges, edges: [], optimalCost: 0}
      const newEdges = [];
      for (let i = 0; i < optimizerOutput.edges.length; i++){
        const optimalEdge = optimizerOutput.edges[i];
        for (let j = 0; j < edgeList.length; j++){
          const edge = edgeList[j];
          // Check if we have correct entry in edge list
          if (optimalEdge[0] === edge[0] && optimalEdge[1] === edge[1]){
            // Add cost to solution edge
            const newEdgeWithCost = [...optimalEdge, edge[2]];
            newEdges.push(newEdgeWithCost);
            // Keep track of total solution cost
            solverOutputWithCost.optimalCost += edge[2];
          }
        }
      }
      solverOutputWithCost.edges = newEdges;
      return solverOutputWithCost
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
      const stdout = await this.solverRunner.runSolverHeuristic("heuristic-solver/src", "../input/", "full_topology/");
      console.log("End")
      return this.solverRunner.parseSolverResultHeuristic(stdout);
      await this.solverRunner.runSolver(solverLocation, outputDirectedTopology, settingFileLocation);
      return this.solverRunner.parseSolverResult(outputLocation);
    }

    /**
     * 
     * @param edgeList 
     * @param relevantDocuments 
     * @param engineTraversalPath 
     * @param rootDocuments 
     * @param solverInputFileLocation Absolute location of the place the metric calculator should construct the input file.
     * This file will be constructed following the .stp format
     */
    public async runMetricAllTest(
      edgeList: number[][],
      relevantDocuments: number[][],
      engineTraversalPath: number[][],
      rootDocuments: number[],
      numNodes: number,
      solverInputFileLocation: string
    ){
      const shortestPath = await this.getOptimalPathAllTest(
        edgeList,
        relevantDocuments,
        engineTraversalPath,
        rootDocuments,
        numNodes,
        solverInputFileLocation
      )

      return this.metricOptimalPathUnweighted.getMetricRatioOptimalVsTraversed(
        shortestPath,
         relevantDocuments.flat(), 
         engineTraversalPath
      );
    }

    public async runMetricFirstKTest(
      k: number,
      edgeList: number[][],
      relevantDocuments: number[][],
      engineTraversalPath: number[][],
      rootDocuments: number[],
      numNodes: number,
      solverInputFileLocation: string
    ){
      const shortestPathAll = await this.getOptimalPathAllTest(
        edgeList,
        relevantDocuments,
        engineTraversalPath,
        rootDocuments,
        numNodes,
        solverInputFileLocation
      )

    }


    public async runMetricAll(      
      topology: TraversedGraph, 
      relevantDocuments: string[],
      engineTraversalPath: number[][], 
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

      const shortestPath = await this.getOptimalPathAll(
        topology, 
        edgeList,
        relevantDocuments, 
        outputDirectedTopology, 
        solverLocation,
        settingFileLocation
      );
    
      // Map to index, we do +1 to make nodes 1 indexed like solver expects.
      const engineTraversalPathOneIndex = engineTraversalPath.map(x => x.map( y => y + 1 ) );
      const relevantDocumentIndex = relevantDocuments.map(x => nodeToIndex[x] + 1 );
      const edgeListOneIndexed = edgeList.map(x => [x[0]+1, x[1]+1, x[2]]);
      
      // Get metric with k = # of results
      return this.metricOptimalPathUnweighted.getMetricFirstK(relevantDocumentIndex.length, relevantDocumentIndex, 
        engineTraversalPathOneIndex, shortestPath.edges, edgeListOneIndexed);
    }

    public async runMetricFirstK(
      k: number, 
      topology: TraversedGraph, 
      relevantDocuments: string[][], 
      engineTraversalPath: number[][],
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

      const solverOutputAllResults = await this.getOptimalPathAll(
        topology, 
        edgeList,
        relevantDocuments.flat(), 
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

      // const engineTraversalPathOneIndex = engineTraversalPath.map(x => x.map( y => y + 1 ) );
      // const relevantDocumentIndex = relevantDocuments.map(x=>nodeToIndex[x] + 1);
      // const edgeListOneIndexed = edgeList.map(x => [x[0]+1, x[1]+1, x[2]]);

      // // Map reduced nodes back to corresponding nodes in full traversed topology
      // const shortestPathFirstK = shortestPath.edges.map(x => x.map(y => shortestPath.nodeReducedToFull[y]));

      // const metricFirstK = this.metricOptimalPathUnweighted.getMetricFirstK(
      //   k,
      //   relevantDocumentIndex, 
      //   engineTraversalPathOneIndex, 
      //   shortestPathFirstK,
      //   edgeListOneIndexed
      // );
        
      // return metricFirstK;
    }

    // public async runUnWeightedMetricFirstK(k: number, topology: TraversedGraph, relevantDocuments: string[], 
    //   engineTraversalPath: string[],
    //   nodeToIndex: Record<string, number>,
    //   outputDirectedTopology: string,
    //   solverLocation: string,
    //   settingFileLocation: string,
    //   outputDirectedTopologyAllResults: string,
    //   solverLocationAllResults: string,
    //   settingFileLocationAllResults: string

    // ){
    //   const solverOutputAllResults = await this.getOptimalPathAll(
    //   topology, 
    //   topology.getEdgeList(),
    //   relevantDocuments, 
    //   outputDirectedTopologyAllResults, 
    //   solverLocationAllResults,
    //   settingFileLocationAllResults
    //   );

    //   const shortestPath = await this.getOptimalPathFirstK(
    //     k, topology, topology.getEdgeList(),
    //     relevantDocuments, 
    //     solverOutputAllResults.edges, 
    //     nodeToIndex,
    //     outputDirectedTopology,
    //     solverLocation,
    //     settingFileLocation
    //   );

    //   const engineTraversalPathNodeIndex = engineTraversalPath.map(x=>nodeToIndex[x] + 1);
    //   const relevantDocumentIndex = relevantDocuments.map(x=>nodeToIndex[x] + 1);


    //   const metricFirstK = this.metricOptimalPathUnweighted.getMetricAll(relevantDocumentIndex, 
    //     engineTraversalPathNodeIndex, 
    //     shortestPath.edges);
      
    //   return metricFirstK;
    // }
}


// const query = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
// PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
// SELECT ?messageId ?messageCreationDate ?messageContent WHERE {
//   ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000000000000000933/profile/card#me>;
//     rdf:type snvoc:Post;
//     snvoc:content ?messageContent;
//     snvoc:creationDate ?messageCreationDate;
//     snvoc:id ?messageId.
// } `;
// const discover_6_1 = `PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
// SELECT DISTINCT ?forumId ?forumTitle WHERE {
//   ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000000000000000933/profile/card#me>.
//   ?forum snvoc:containerOf ?message;
//     snvoc:id ?forumId;
//     snvoc:title ?forumTitle.
// }`

// const discover_8_5 = `PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
// SELECT DISTINCT ?creator ?messageContent WHERE {
//   <https://solidbench.linkeddatafragments.org/pods/00000006597069767117/profile/card#me> snvoc:likes _:g_0.
//   _:g_0 (snvoc:hasPost|snvoc:hasComment) ?message.
//   ?message snvoc:hasCreator ?creator.
//   ?otherMessage snvoc:hasCreator ?creator;
//     snvoc:content ?messageContent.
// }
// LIMIT 10`

// const discover_3_5 = `PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
// PREFIX foaf: <http://xmlns.com/foaf/0.1/>
// SELECT ?tagName (COUNT(?message) AS ?messages) WHERE {
//   ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000006597069767117/profile/card#me>;
//     snvoc:hasTag ?tag.
//   ?tag foaf:name ?tagName.
// }
// GROUP BY ?tagName
// ORDER BY DESC (?messages)`


// const discover_4_5 = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
// PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
// PREFIX foaf: <http://xmlns.com/foaf/0.1/>
// SELECT ?locationName (COUNT(?message) AS ?messages) WHERE {
//   ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000006597069767117/profile/card#me>;
//     rdf:type snvoc:Comment;
//     snvoc:isLocatedIn ?location.
//   ?location foaf:name ?locationName.
// }
// GROUP BY ?locationName
// ORDER BY DESC (?messages)`
// const runner = new LinkTraversalPerformanceMetrics();
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

export type topologyType = "unweighted" | "httpRequestTime" | "documentSize"