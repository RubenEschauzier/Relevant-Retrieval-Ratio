import { TraversedGraph } from "@comunica/actor-construct-traversed-topology-url-to-graph"
import * as assert from "assert"
class MetricOptimalTraversalUnweighted{
    public constructor(){
    }
    /**
     * Get metric comparing optimal traversal path for all results vs engine's traversal path
     * The metric represent the percentage of links dereferenced that were on the optimal path
     */
    public getMetricUnweighted(relevantDocumentNodeIds: number[], engineTraversalPath: number[], optimalTraversalPath: number[][]){
        const relevantTraversalPath = this.getTraversalPointAllRelevantDocumentsVisited(relevantDocumentNodeIds, engineTraversalPath);
        const optimalTraversalPathFlat = this.getNodeVisitOrderOptimalPath(optimalTraversalPath);
        return ((relevantTraversalPath.length - optimalTraversalPathFlat.length) / engineTraversalPath.length)*100;
    }

    public getMetricWeighted(relevantDocumentNodeIds: number[], engineTraversalPath: number[], optimalTraversalPath: number[][]){
        
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
    public getTraversalPointAllRelevantDocumentsVisited(relevantDocumentNodeIds: number[], engineTraversalPath: number[]): number[]  {
        const visitedRelevantNodes = new Set();
        const traversalUntillAllVisited = [];
        for (let i = 0; i < engineTraversalPath.length; i++){
            const newVisitedNode = engineTraversalPath[i];
            if (relevantDocumentNodeIds.includes(newVisitedNode)){
                visitedRelevantNodes.add(newVisitedNode);
            }
            traversalUntillAllVisited.push(newVisitedNode);
            if (visitedRelevantNodes.size == relevantDocumentNodeIds.length){
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