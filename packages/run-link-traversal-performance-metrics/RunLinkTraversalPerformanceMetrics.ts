import { ISolverOutput, SolverRunner } from "../solver-runner/SolverRunner";
import { MetricOptimalTraversal } from "../metric-optimal-traversal/MetricOptimalTraversal";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from "url";
import { stringify } from "querystring";

export class RunLinkTraversalPerformanceMetrics{
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
  /**
   * Function that takes all documents with same parents and collapses them into one document with multiple results.
   * This is based on the observation that Solid pod documents share the same parent (the pod or directory).
   * 
   * @param relevantDocuments 
   */
  public collapseSameParentOneHopDocuments(relevantDocuments: string[][], nodeToIndex: Record<string, number>):
  collapseRelevantDocumentsOutput {
    const parentDocumentOccurences: Record<string, number> = {};
    // Get number of contributing documents per parent path
    for (const document of relevantDocuments.flat()){
      const splitDocument = document.split('/');
      splitDocument.pop();
      const parentPathDocument = splitDocument.join('/') + '/';
      parentDocumentOccurences[parentPathDocument] = (parentDocumentOccurences[parentPathDocument] || 0) + 1;
    }
    // For all parent paths that have multiple contributing documents we collapse to parent path
    const collapsedRelevantDocuments: string[][] = [];
    for (const relevantDocumentsResult of relevantDocuments){
      const collapsedRelevantDocumentsSingleResult: string[] = []
      for (const document of relevantDocumentsResult){
        const splitDocument = document.split('/');
        splitDocument.pop();
        const parentPathDocument = splitDocument.join('/') + '/';
        if (parentDocumentOccurences[parentPathDocument] > 1){
          collapsedRelevantDocumentsSingleResult.push(parentPathDocument);
        }
        else{
          collapsedRelevantDocumentsSingleResult.push(document);
        }
      }
      collapsedRelevantDocuments.push(collapsedRelevantDocumentsSingleResult);
    }
    // Convert to node indexes
    const parentDocumentOccurencesAsIndex: Record<number, number> = {};
    for (const key in parentDocumentOccurences){
      if (!nodeToIndex[key]){
        console.error("Using reduced parent URL that is not in traversed topology")
      }
      parentDocumentOccurencesAsIndex[nodeToIndex[key]] = parentDocumentOccurences[key];
    }
    const collapsedRelevantDocumentsAsIndex: number[][] = collapsedRelevantDocuments.map(x => x.map(y => nodeToIndex[y]));
    return {
      collapsedRelevantDocuments,
      collapsedRelevantDocumentsAsIndex,
      parentDocumentOccurences,
      parentDocumentOccurencesAsIndex
    };
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
  /**
   * If results have the same contributing documents, we can aggregate them into one option. However this means that the
   * generated combinations should sum to K with the sum taking into account the number of results in an aggregation.
   * Furthermore, any aggregations with numResults > K should also be included.
   */
  public getAllValidCombinationsWithSameDocumentAggregation(contributingDocuments: number[][], numResults: number): number[][][]{
    const documentsAndNumResults: Record<string, number> = {};
    // Aggregate results with same contributing documents 
    for (let i = 0; i < contributingDocuments.length; i ++){
      const sortedArray = [...contributingDocuments[i]].sort((a, b) => a - b);
      const keyArray: string = JSON.stringify(sortedArray);
      documentsAndNumResults[keyArray] ? documentsAndNumResults[keyArray] += 1 : documentsAndNumResults[keyArray] = 1;
    }
    // Create array from Record to sort them
    const arrayDocumentsAndNumResult: [string, number][] = []
    
    for (const documents in documentsAndNumResults) {
      arrayDocumentsAndNumResult.push([documents, documentsAndNumResults[documents]]);
    }
    // Sort the the documents based on num results
    arrayDocumentsAndNumResult.sort((a, b) => a[1] - b[1]);
    
    // To store combination
    const allCombinations: number[][][] = [];
    const local: number[][] = [];

    // Fill allCombinations array with possible combinations
    unique_combination(0, 0, numResults, local, arrayDocumentsAndNumResult, documentsAndNumResults);
    
    // If one result aggregation has more results, this should also be included as possibility
    for (let i = 0; i < arrayDocumentsAndNumResult.length; i++){
      if (arrayDocumentsAndNumResult[i][1] > numResults){
        allCombinations.push([JSON.parse(arrayDocumentsAndNumResult[i][0])]);
      }
    }

    function unique_combination(
      l: number, 
      sum: number,
      numResultsNeeded: number, 
      local: number[][], 
      arrayDocumentsAndNumResult: [string, number][],
      documentsAndNumResults: Record<string, number>
      ) {
      // If a unique combination is found
      if (sum == numResultsNeeded) {
        allCombinations.push(local);
        return;
      }
   
      // For all other combinations
      for (let i = l; i < arrayDocumentsAndNumResult.length; i++) {
   
          // Check if the sum exceeds K
          
          if (sum + arrayDocumentsAndNumResult[i][1] > numResultsNeeded){
            let potentiallyOptimal = true;
            // Any potential combination that is over the number of results and has a document combination that produces 1 result will never be optimal
            for (let k = 0; k < local.length; k++){
              if (documentsAndNumResults[JSON.stringify(local[k])] == 1){
                potentiallyOptimal = false;
              }
              // Any document combinations that produce more or equal to the number of results will be added later
              if (documentsAndNumResults[JSON.stringify(local[k])] >= numResultsNeeded){
                potentiallyOptimal = false;
              }
            }
            if (arrayDocumentsAndNumResult[i][1] >= numResultsNeeded){
              potentiallyOptimal = false;
            }
            if (potentiallyOptimal){
              allCombinations.push([...local, JSON.parse(arrayDocumentsAndNumResult[i][0])]);
            }
            continue;
          }
   
          // Take the element into the combination
          local.push(JSON.parse(arrayDocumentsAndNumResult[i][0]));
   
          // Recursive call
          unique_combination(
            i + 1, 
            sum + arrayDocumentsAndNumResult[i][1], 
            numResultsNeeded, 
            [...local], 
            arrayDocumentsAndNumResult, 
            documentsAndNumResults
          );
          // Remove element from the combination
          local.pop();
      }
    }
    return allCombinations
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
   * Get fastest path to first $k$ results by iterating over all combinations of results of size $k$ and calculating the steiner tree for these combinations
   * @param k 
   * @param edgeList 
   * @param relevantDocuments 
   * @param rootDocuments 
   * @param numNodes 
   * @param solverInputFileLocation 
   * @param searchType "full" or "reduced". If the search for optimal first k is done over the full topology or only the reduced topology from the optimal path
   * for all results in the full topology. Full topology will require more resources, especially if the number of nodes is large
   * @param batchSize the number of files generated and solved in one go
   * @param allowRandomSampling Whether the it is allowed to randomly sample combinations instead of computing all. Recommended for queries with a large number 
   * of results / large K
   * @param numberRandomSamples 
   */
  // NOTE WE SHOULD INCLUDE ABSOLUTELY FASTEST OPTIMAL PATH (WITHOUT WEIGHTS) AND OPTIMAL PATH WITH WEIGHTS FOR FULL METRIC
  public async getOptimalPathFirstKFast(
    k: number,
    edgeList: number[][],
    relevantDocuments: number[][],
    relevantDocumentsString: string[][],
    documentToNode: Record<string, number>,
    rootDocuments: number[],
    numNodes: number,
    optimalSolutionAll: ISolverOutput,
    solverInputFileLocation: string,
    searchType: searchType,
    batchSize = 10000,
    allowRandomSampling = false,
    numberRandomSamples = 1_000_000
  ){
    const numValidCombinations = this.getNumValidCombinations(relevantDocuments.length, k);
    const numNodesReducedProblem = new Set(optimalSolutionAll.edges.flat()).size;

    if (numValidCombinations > 1000000){
      console.info(`INFO: Possibly large number of combinations (${numValidCombinations}) to compute detected.`);
    }
    console.log(relevantDocumentsString);

    const collapseRelevantDocumentsOutput = this.collapseSameParentOneHopDocuments(relevantDocumentsString, documentToNode);

    console.log(collapseRelevantDocumentsOutput.collapsedRelevantDocuments);
    let combinations = this.getAllValidCombinationsWithSameDocumentAggregation(relevantDocuments, k);
    
    if (numValidCombinations > 10000000){
      console.info(`INFO: After eliminating all results with equal contributing documents we compute: ${combinations.length} combinations`);
    }

    if (allowRandomSampling && combinations.length > numberRandomSamples){
      let shuffledCombinations = combinations
                    .map(value => ({ value, sort: Math.random() }))
                    .sort((a, b) => a.sort - b.sort)
                    .map(({ value }) => value)
      combinations = shuffledCombinations.slice(0, numberRandomSamples);
      console.info(`INFO: Randomly sampled ${combinations.length} combinations`)
    }

    const splitPath = solverInputFileLocation.split('/');
    // We get sub-directory that the directed topology file is saved in
    const inputDirectoryForSolver = splitPath.slice(splitPath.length - 2, splitPath.length - 1) + "/";
    // Get absolute path to parent-directory of directory topology file is saved in
    const parentDirectoryInputDirectory = splitPath.slice(0, splitPath.length - 2).join('/')+"/";
    // Absolute path to the directory for code of the heuristic solver
    const heuristicSolverPath = path.join(__dirname, "..", "..", "heuristic-solver", "src");
    this.removeAllFilesInDir(path.join(parentDirectoryInputDirectory, inputDirectoryForSolver));

    if (fs.readdirSync(path.join(parentDirectoryInputDirectory, inputDirectoryForSolver)).length > 0){
      console.warn("Directory with solver inputs is not empty, the metric expects this directory to be empty");
    }
    const nBatches = Math.max(1, Math.floor(combinations.length / batchSize));
    
    let minCost = Infinity
    let bestOutputIndex = -1;
    let bestSolverOutput: ISolverOutput = {nEdges: -1, optimalCost: -1, edges: []};

    for (let b = 0; b < nBatches; b++){
      if (nBatches > 10){
        console.log(`Batch ${b+1}/${nBatches}`);
      }
      const extraCostInBatch: number[] = [];
      // Write the problem files for all combinations in batch, and after run solver on all files in directory
      const maxI = Math.min(batchSize, combinations.slice(b*batchSize).length);
      for (let i = 0; i < maxI; i++){
        // We can decide to either do full search here or partial search
        const combinationToSearch = combinations[(b*batchSize) + i];
        if (searchType === "full"){
          this.solverRunner.writeDirectedTopologyToFile(
            edgeList,
            combinationToSearch,
            rootDocuments, 
            numNodes,
            path.join(parentDirectoryInputDirectory, inputDirectoryForSolver, `input-file${i}.stp`) 
          );
        }
        if (searchType === "reduced"){
          this.solverRunner.writeDirectedTopologyToFile(
            optimalSolutionAll.edges,
            combinationToSearch,
            rootDocuments,
            numNodesReducedProblem,
            path.join(parentDirectoryInputDirectory, inputDirectoryForSolver, `input-file${i}.stp`) 
          );
        } 
        let totalExtraCostCombination = 0;
        for (const documentIndex of combinationToSearch.flat()){
          // If our node index is a collapsed one we +1 the cost (Note this might give slightly wrong results if
          // the parent node is also a relevant document)
          if (collapseRelevantDocumentsOutput.parentDocumentOccurencesAsIndex[documentIndex] > 1){
            totalExtraCostCombination += 1;
          }
        }
        extraCostInBatch.push(totalExtraCostCombination);
      }
      const stdout = await this.solverRunner.runSolverHeuristic(
        heuristicSolverPath, 
        parentDirectoryInputDirectory, 
        inputDirectoryForSolver
      );
  
      const solverOutputs = this.solverRunner.parseAllSolverResultHeuristic(stdout);
      const solverOutputsWithCost = solverOutputs.map(x => this.attachCostToSolverOutput(x, edgeList));

      for (let i = 0; i < solverOutputsWithCost.length; i++){
        solverOutputsWithCost[i].optimalCost += extraCostInBatch[i];
      }
      
      // TODO: CHANGE THIS TO CONSIDER BOTH UNWEIGHTED AND WEIGHTED BEST PATHS
      for (let j = 0; j < solverOutputsWithCost.length; j++){
        if (solverOutputsWithCost[j].optimalCost < minCost){
          minCost = solverOutputsWithCost[j].optimalCost;
          bestOutputIndex = j;
          bestSolverOutput = solverOutputsWithCost[j];
        }
      }
      
      // Remove files from directory for next run
      this.removeAllFilesInDir(path.join(parentDirectoryInputDirectory, inputDirectoryForSolver));  
    }
    return bestSolverOutput;
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
    const splitPath = solverInputFileLocation.split('/');
    // We get sub-directory that the directed topology file is saved in
    const inputDirectoryForSolver = splitPath.slice(splitPath.length - 2, splitPath.length - 1) + "/";
    // Get absolute path to parent-directory of directory topology file is saved in
    const parentDirectoryInputDirectory = splitPath.slice(0, splitPath.length - 2).join('/')+"/";
    // Absolute path to the directory for code of the heuristic solver
    const heuristicSolverPath = path.join(__dirname, "..", "..", "heuristic-solver", "src");

    this.removeAllFilesInDir(path.join(parentDirectoryInputDirectory, inputDirectoryForSolver));

    if (fs.readdirSync(path.join(parentDirectoryInputDirectory, inputDirectoryForSolver)).length > 0){
      console.warn("Directory with solver inputs is not empty, the metric expects this directory to be empty");
    }

    // Write traversal information to .stp file that serves as input to steiner tree solvers. Such format is used by various
    // solvers. 
    this.solverRunner.writeDirectedTopologyToFile(
      edgeList,
      relevantDocuments,
      rootDocuments, 
      numNodes,
      solverInputFileLocation
    );

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
   * @param edgeList Edgelist of traversed topology [start, end, weight]
   * @param relevantDocuments Ids of nodes that represent the documents needed to produce results 
   * @param engineTraversalPath Node ids of traversal order engine
   * @param rootDocuments The seed documents used in query
   * @param solverInputFileLocation Absolute location of the place the metric calculator should construct the input file.
   * This file will be constructed following the .stp format. Default points to file location is github directory structure
   */
  public async runMetricAll(
    edgeList: number[][],
    relevantDocuments: number[][],
    engineTraversalPath: number[][],
    rootDocuments: number[],
    numNodes: number,
    solverInputFileLocation?: string
  ){
    if (!solverInputFileLocation){
      solverInputFileLocation = path.join(__dirname, "..", "..", 
      "heuristic-solver", "input", "full_topology", "input-file.stp");
    }
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
    relevantDocumentsString: string[][],
    documentToNode: Record<string, number>,
    engineTraversalPath: number[][],
    rootDocuments: number[],
    numNodes: number,
    searchType: searchType,
    solverInputFileLocation?: string,
    batchSize?: number,
    allowRandomSampling?: boolean,
    numSamples?: number
  ){
    if (!solverInputFileLocation){
      solverInputFileLocation = path.join(__dirname, "..", "..", 
      "heuristic-solver", "input", "full_topology", "input-file.stp");
    }

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
      relevantDocumentsString,
      documentToNode,
      rootDocuments,
      numNodes,
      solverOutputAllResults,
      solverInputFileLocation,
      searchType, 
      batchSize,
      allowRandomSampling,
      numSamples
    );
    
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

  // Strings of contributing documents
  contributingDocuments: string[][];

  // Convert string to document
  documentToNode: Record<string, number>;

  // Engine traversal path
  traversedPath: number[][];

  // number of nodes in topology
  numNodes: number;

  // 1 indexed roots
  roots: number[];

}

export interface collapseRelevantDocumentsOutput {
  // Collapsed version of document URIs
  collapsedRelevantDocuments: string[][]
  // Collapsed node index of documents
  collapsedRelevantDocumentsAsIndex: number[][];
  // The document parent URLs belonging to collapsed document URIs
  parentDocumentOccurences: Record<string, number>;
  // The document index belonging to collapsed URIs
  parentDocumentOccurencesAsIndex: Record<number, number>
}

export type topologyType = "unweighted" | "httpRequestTime" | "documentSize";

export type searchType = "full" | "reduced";


// const testCase = [[1,2],[1,2],[1,2],[1,3],[5],[6],[7],[3,4], [3,4], [8],[1,3], [3,4], [3,4], [1,2,3],[1,2,3],[1,2,3],[1,2,3],[1,2,3], [0]
// , [0], [0], [0], [0], [0], [0], [0], [0], [-1], [-1], [-1]];
// const testCaseNumResults = 4;
// const test = new RunLinkTraversalPerformanceMetrics();
// test.getAllValidCombinationsWithSameDocumentAggregation(testCase, testCaseNumResults);
// console.log(test.getAllValidCombinations(testCase, testCaseNumResults).length);