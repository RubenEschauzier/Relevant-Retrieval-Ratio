class MetricOptimalTraversalUnweighted{
    public constructor(){
    }
    /**
     * Get metric comparing optimal traversal path for all results vs engine's traversal path
     * The metric represent the percentage of links dereferenced that were on the optimal path
     */
    public getMetricAll(relevantDocumentNodeIds: number[], engineTraversalPath: number[], optimalTraversalPath: number[][]){
        const relevantTraversalPath = this.getTraversalPointKRelevantDocumentsVisited(
            relevantDocumentNodeIds.length, relevantDocumentNodeIds, engineTraversalPath
        );
        const optimalTraversalPathFlat = this.getNodeVisitOrderOptimalPath(optimalTraversalPath);
        // TODO: THIS IS WRONG SEE run-comunica-traversed-graph-annotations.ts
        return ((relevantTraversalPath.length - optimalTraversalPathFlat.length) / relevantTraversalPath.length)*100;
    }

    /**
     * Get metric for first $k$ results. Compare optimal path calculated using steiner trees to the path the engine takes untill 
     * it dereferences enough documents for $k$ results.
     * TODO: Think about when multiple documents are needed for 1 result, we don't deal with that properly now as each document will be treated 
     * as seperate result.
     * TODO: Metric needs to be either: we follow this many times more links than needed (simple division tbh)
     * @param k 
     * @param relevantDocumentNodeIds 
     * @param engineTraversalPath 
     * @param optimalTraversalPath 
     * @returns 
     */
    public getMetricFirstK(k: number, relevantDocumentNodeIds: number[], engineTraversalPath: number[], optimalTraversalPath: number[][]){
        const relevantTraversalPath = this.getTraversalPointKRelevantDocumentsVisited(k, relevantDocumentNodeIds, engineTraversalPath);
        const optimalTraversalPathFlat = this.getNodeVisitOrderOptimalPath(optimalTraversalPath);
        console.log(relevantTraversalPath);
        console.log(optimalTraversalPath);
        console.log(optimalTraversalPathFlat)
        return ((relevantTraversalPath.length - optimalTraversalPathFlat.length) / relevantTraversalPath.length)*100;
    }

    public getMetricWeightedPenalty(){
    }

    public getAllRootNodes(metadata: Record<string, any>[]){
        const roots = [];
        for (let i = 0; i < metadata.length; i++){
            if (metadata[i].hasParent === false){
                // Nodes are 1 indexed in the solver format, so the root index will be +1
                roots.push(i+1);
            }
        }
        return roots;
    }

    /**
     * Function that gets the traversal needed to visit all relevant documents in the query
     * @param relevantDocumentNodeIds The node ids that are relevant to the query
     * @param engineTraversalPath The traversal path the engine dereferenced documents in
     * @returns The minimal required traversal of the engine to get to all relevant documents
     */
    public getTraversalPointKRelevantDocumentsVisited(k: number, relevantDocumentNodeIds: number[], engineTraversalPath: number[]): number[]  {
        const visitedRelevantNodes = new Set();
        const traversalUntillAllVisited = [];
        for (let i = 0; i < engineTraversalPath.length; i++){
            const newVisitedNode = engineTraversalPath[i];
            if (relevantDocumentNodeIds.includes(newVisitedNode)){
                visitedRelevantNodes.add(newVisitedNode);
            }
            traversalUntillAllVisited.push(newVisitedNode);
            if (visitedRelevantNodes.size == k){
                break;
            }
        }
        return traversalUntillAllVisited;
    }

    public getNodeVisitOrderOptimalPath(optimalTraversalPath: number[][]): number[]{
        return Array.from(new Set(optimalTraversalPath.flat()));
    }
}

export { MetricOptimalTraversalUnweighted }