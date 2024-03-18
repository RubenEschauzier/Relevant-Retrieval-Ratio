import { ISolverOutput } from "../solver-runner/SolverRunner";

export class MetricOptimalTraversal{    
    /**
     * Function that calculates the ratio between optimal cost and traversed cost for a set of documents needed to obtain the 
     * first @param k results.
     * @param k Number of required results
     * @param solverOutput The solver output, includes the optimal cost / path to find first @param k results
     * @param relevantDocumentNodeIds The documents required to produce the query results
     * @param engineTraversalPath The traversal path by the engine to execute the query
     */
    public getMetricRatioOptimalVsRealisedKResults(
        k: number,
        solverOutput: ISolverOutput,
        relevantDocumentNodeIds: number[][], 
        engineTraversalPath: number[][]
    ){
        const relevantEngineTraversalPath = this.getTraversalPointKRelevantDocumentsVisited(
            k, 
            relevantDocumentNodeIds, 
            engineTraversalPath
        );
        const enginePathCost = relevantEngineTraversalPath.reduce((accumulator, currentValue) => accumulator + currentValue[2], 0);
        return enginePathCost / solverOutput.optimalCost;
    }

    /**
     * Lower is better
     * Function that calculates the ratio between optimal path and traversed path with weight 1, and adds a penalty based the ratio of the 
     * cost of the optimal path / length of path and the traversed path / length of path. 
     * This penalty term is controlled by parameter lambda. 
     * Intuitively this is seen as a penalty or reward for taking 'better' edges on average. The importance taking better edges can be controlled
     * by the paramter.
     * 
     * @param lmbda penalty coefficient
     * @param k Number of required results
     * @param solverOutput The solver output, includes the optimal cost / path to find first @param k results. Should have weighted edges (not 1)
     * @param relevantDocumentNodeIds The documents required to produce the query results
     * @param engineTraversalPath The traversal path by the engine to execute the query
     */
    public getMetricWeightedPenalty(
        lambda: number,
        k: number,
        solverOutput: ISolverOutput,
        relevantDocumentNodeIds: number[][], 
        engineTraversalPath: number[][]
    ){
        
    }

    /**
     * Function that gets the minimal traversal needed to visit the documents required for @param k results.
     * @param k Number of results to find
     * @param relevantDocumentNodeIds The node ids of documents that produce the query results
     * @param engineTraversalPath The traversal path the engine dereferenced documents in
     * @returns The minimal required traversal of the engine to get to all relevant documents
     */
    public getTraversalPointKRelevantDocumentsVisited(
        k: number, 
        relevantDocumentNodeIds: number[][], 
        engineTraversalPath: number[][]
        ): number[][]  
        {
        // Iterate over engine traversal path, update to visit for result, after update check if new list is empty
        // if it is empty we have +1 result
        const progressUntillResult: Record<number, number[]> = {};
        for (let i = 0; i < relevantDocumentNodeIds.length; i++){
            progressUntillResult[i] = relevantDocumentNodeIds[i];
        }

        let numResultFound = 0;
        const traversalUntillAllVisited: number[][] = [];
        for (let i = 0; i < engineTraversalPath.length; i++){
            const newVisitedNode = engineTraversalPath[i];
            traversalUntillAllVisited.push(newVisitedNode);
            // Edge denotes traversal to second element of edge, so we only check if second element
            // Is a relevant node
            for (let j = 0; j < relevantDocumentNodeIds.length; j++){
                if (progressUntillResult[j].includes(newVisitedNode[1])){
                    const nodes = [...progressUntillResult[j]];
                    // Remove currently found document
                    nodes.splice(nodes.indexOf(newVisitedNode[1]), 1);
                    progressUntillResult[j] = nodes;
                    if (progressUntillResult[j].length === 0){
                        numResultFound += 1;
                    }
                }
            }
            if (numResultFound >= k){
                break;
            }
        }
        return traversalUntillAllVisited;
    }
}