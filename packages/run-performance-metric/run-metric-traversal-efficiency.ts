import { ISolverOutput, SolverRunner } from "../solver-runner/SolverRunner";
import { MetricOptimalTraversal } from "../metric-optimal-traversal/MetricOptimalTraversal";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from "url";

export class LinkTraversalPerformanceMetrics{
  public binomialLookUp: number[];
  public solverRunner: SolverRunner;

  public metricOptimalPathUnweighted: MetricOptimalTraversal;

  public constructor(){
    this.binomialLookUp = this.preComputeLookUpTable();
    this.solverRunner = new SolverRunner();
    this.metricOptimalPathUnweighted = new MetricOptimalTraversal();
  }

  public removeAllFilesInDir(directoryLocation: string){
    const files = fs.readdirSync(directoryLocation);
    for (const file of files) {
      fs.unlinkSync(path.join(directoryLocation, file));
    }
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

  /**
   * 
   * @param k 
   * @param edgeList 
   * @param relevantDocuments 
   * @param rootDocuments 
   * @param numNodes 
   * @param solverInputFileLocation 
   * @param searchType "full" or "reduced". If the search for optimal first k is done over the full topology or only the reduced topology from the optimal path
   * for all results in the full topology. Full topology will require more resources, especially if the number of nodes is large
   */
  public async getOptimalPathFirstK(
    k: number,
    edgeList: number[][],
    relevantDocuments: number[][],
    rootDocuments: number[],
    numNodes: number,
    optimalSolutionAll: ISolverOutput,
    solverInputFileLocation: string,
    searchType: searchType
  ){
    let optimalSolverOutput: ISolverOutput = {nEdges: Infinity, edges: [], optimalCost: Infinity};

    const numValidCombinations = this.getNumValidCombinations(relevantDocuments.length, k);
    const numNodesReducedProblem = new Set(optimalSolutionAll.edges.flat()).size;

    if (numValidCombinations > 1000000){
      console.warn(`INFO: Large number of combinations (${numValidCombinations}) to compute detected.`);
    }

    const combinations = this.getAllValidCombinations(relevantDocuments, k);

    for (const combination of combinations){
      // We cna decide to either do full search here or partial search
      if (searchType === "full"){
        const pathForCombination = await this.getOptimalPathAll(
          edgeList, 
          combination,
          rootDocuments,
          numNodes,
          solverInputFileLocation
        );
        if (pathForCombination.optimalCost < optimalSolverOutput.optimalCost){
          optimalSolverOutput = pathForCombination;
        }
      }
      if (searchType === 'reduced'){
        const pathForCombinationReduced = await this.getOptimalPathAll(
          optimalSolutionAll.edges,
          combination,
          rootDocuments,
          numNodesReducedProblem,
          solverInputFileLocation
        );

        if (pathForCombinationReduced.optimalCost < optimalSolverOutput.optimalCost){
          optimalSolverOutput = pathForCombinationReduced;
        }
      }
    }
    
    return optimalSolverOutput;
  }

  // NOTE WE SHOULD INCLUDE ABSOLUTELY FASTEST OPTIMAL PATH (WITHOUT WEIGHTS) AND OPTIMAL PATH WITH WEIGHTS FOR FULL METRIC
  public async getOptimalPathFirstKFast(
    k: number,
    edgeList: number[][],
    relevantDocuments: number[][],
    rootDocuments: number[],
    numNodes: number,
    optimalSolutionAll: ISolverOutput,
    solverInputFileLocation: string,
    searchType: searchType
  ){
    let optimalSolverOutput: ISolverOutput = {nEdges: Infinity, edges: [], optimalCost: Infinity};

    const numValidCombinations = this.getNumValidCombinations(relevantDocuments.length, k);
    const numNodesReducedProblem = new Set(optimalSolutionAll.edges.flat()).size;

    if (numValidCombinations > 1000000){
      console.warn(`INFO: Large number of combinations (${numValidCombinations}) to compute detected.`);
    }

    const combinations = this.getAllValidCombinations(relevantDocuments, k);
    
    const splitPath = solverInputFileLocation.split('/');
    // We get sub-directory that the directed topology file is saved in
    const inputDirectoryForSolver = splitPath.slice(splitPath.length - 2, splitPath.length - 1) + "/";
    // Get absolute path to parent-directory of directory topology file is saved in
    const parentDirectoryInputDirectory = splitPath.slice(0, splitPath.length - 2).join('/')+"/";
    // Absolute path to the directory for code of the heuristic solver
    const heuristicSolverPath = path.join(__dirname, "..", "..", "heuristic-solver", "src");

    // Write the problem files for all combinations, and after run solver on all files in directory
    for (let i = 0; i < combinations.length; i++){
      // We can decide to either do full search here or partial search
      if (searchType === "full"){
        this.solverRunner.writeDirectedTopologyToFile(
          edgeList,
          combinations[i],
          rootDocuments, 
          numNodes,
          path.join(parentDirectoryInputDirectory, inputDirectoryForSolver, `input-file${i}.stp`) 
        );
      }
      if (searchType === "reduced"){
        this.solverRunner.writeDirectedTopologyToFile(
          optimalSolutionAll.edges,
          combinations[i],
          rootDocuments,
          numNodesReducedProblem,
          path.join(parentDirectoryInputDirectory, inputDirectoryForSolver, `input-file${i}.stp`) 
        );
      } 
    }
    const stdout = await this.solverRunner.runSolverHeuristic(
      heuristicSolverPath, 
      parentDirectoryInputDirectory, 
      inputDirectoryForSolver
    );

    const solverOutputs = this.solverRunner.parseAllSolverResultHeuristic(stdout);
    const solverOutputsWithCost = solverOutputs.map(x => this.attachCostToSolverOutput(x, edgeList))

    // TODO: CHANGE THIS TO CONSIDER BOTH UNWEIGHTED AND WEIGHTED BEST PATHS
    let minCost = Infinity
    let bestOutputIndex = -1;
    for (let j = 0; j < solverOutputsWithCost.length; j++){
      if (solverOutputsWithCost[j].optimalCost < minCost){
        minCost = solverOutputsWithCost[j].optimalCost;
        bestOutputIndex = j;
      }
    }

    // Remove files from directory for next run
    this.removeAllFilesInDir(path.join(parentDirectoryInputDirectory, inputDirectoryForSolver));

    return solverOutputsWithCost[bestOutputIndex]
  }


  /**
   * Calculates the optimal path to take to traverse all terminal nodes in the graph. Note this implementation uses a heuristic.
   * It is not guaranteed to be optimal.
   * @param edgeList 
   * @param relevantDocuments 
   * @param engineTraversalPath 
   * @param rootDocuments 
   * @param solverInputFileLocation 
   */
  public async getOptimalPathAll(
    edgeList: number[][],
    relevantDocuments: number[][],
    rootDocuments: number[],
    numNodes: number,
    solverInputFileLocation: string
  ){
    // Write traversal information to .stp file that serves as input to steiner tree solvers. Such format is used by various
    // solvers. 
    this.solverRunner.writeDirectedTopologyToFile(
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
    
    // Remove file after getting solver output

    const solverOutput = this.solverRunner.parseSolverResultHeuristic(stdout);
    // Attach the cost back to the solution, as the solver doesn't report it
    const solverOutputWithCost = this.attachCostToSolverOutput(solverOutput, edgeList);

    this.removeAllFilesInDir(path.join(parentDirectoryInputDirectory, inputDirectoryForSolver));
    return solverOutputWithCost
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
  public async runMetricAll(
    edgeList: number[][],
    relevantDocuments: number[][],
    engineTraversalPath: number[][],
    rootDocuments: number[],
    numNodes: number,
    solverInputFileLocation: string
  ){
    // Get optimal path to traverse the documents required for all results to query
    const shortestPath = await this.getOptimalPathAll(
      edgeList,
      relevantDocuments,
      rootDocuments,
      numNodes,
      solverInputFileLocation
    )
    // Return metric with k = number of documents to get all results
    return this.metricOptimalPathUnweighted.getMetricRatioOptimalVsRealisedKResults(
      relevantDocuments.length,
      shortestPath,
      relevantDocuments, 
      engineTraversalPath
    );
  }

  public async runMetricFirstK(
    k: number,
    edgeList: number[][],
    relevantDocuments: number[][],
    engineTraversalPath: number[][],
    rootDocuments: number[],
    numNodes: number,
    solverInputFileLocation: string,
    searchType: searchType
  ){
    // Get optimal path to traverse the documents required for all results of query
    // This is used in case searchType === 'reduced', as optimal path for k will only be determined within
    // the optimal traversal graph for all results
    const solverOutputAllResults = await this.getOptimalPathAll(
      edgeList,
      relevantDocuments,
      rootDocuments,
      numNodes,
      solverInputFileLocation
    );
    const solverOutputFirstKResults = await this.getOptimalPathFirstKFast(
      k,
      edgeList,
      relevantDocuments,
      rootDocuments,
      numNodes,
      solverOutputAllResults,
      solverInputFileLocation,
      searchType, 
    );
    
    // Get optimal path to traverse the documents required for k results of query
    // const solverOutputFirstKResults = await this.getOptimalPathFirstK(
    //   k,
    //   edgeList,
    //   relevantDocuments,
    //   rootDocuments,
    //   numNodes,
    //   solverOutputAllResults,
    //   solverInputFileLocation,
    //   searchType
    // );
    // console.log(test)
    // console.log(solverOutputFirstKResults)
    // Get metric for first k results. The engine traversal path only requires k results to be found, it does not require
    // the same documents as the optimal path found by the solver
    return this.metricOptimalPathUnweighted.getMetricRatioOptimalVsRealisedKResults(
      k,
      solverOutputFirstKResults,
      relevantDocuments, 
      engineTraversalPath
    );
  }
}

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

export type topologyType = "unweighted" | "httpRequestTime" | "documentSize";

export type searchType = "full" | "reduced";