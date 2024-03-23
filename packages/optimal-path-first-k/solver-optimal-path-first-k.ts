import * as fs from 'fs';
import * as path from 'path';
import { Queue } from '@datastructures-js/queue';
import { pathToFileURL } from 'url';

var dijkstra = require('dijkstrajs');
const dataTopology = JSON.parse(fs.readFileSync(path.join(__dirname, "../../log/topologyQuery0.txt"), 'utf8'));
const metricInput = JSON.parse(fs.readFileSync(path.join(__dirname, "../../log/metricInput0.txt"), 'utf8'));


function convertEdgeListToIncomingEdges(edgeList: number[][], numNodes: number){
    const incomingEdges: Record<number, number[]> = {};
    for (let i = 0; i < numNodes; i++){
        incomingEdges[i] = [];
    }
    // Convert [start, end, weight] to node: [incoming edges]
    for (const edge of edgeList){
        incomingEdges[edge[1]].push(edge[0]);
    }
    return incomingEdges;
}
function convertToDijkstraInput(edgeList: number[][]){
    // Expected format: edgelist as dict
    const dijkstraInput: Record<number, Record<number, number>> = {};
    for (let node = 0; node < edgeList.length; node++){
        const edgeListAsDict: Record<number, number> = {};
        for (let i = 0; i < edgeList[node].length; i++){
            edgeListAsDict[edgeList[node][i]] = 1;
        }
        dijkstraInput[node] = edgeListAsDict
    }
    return dijkstraInput
}

function findReachableTerminals(currentNode: number, terminals: number[], edgelistDict: Record<number, Record<number, number>>){
    for (const terminal of terminals){
        const path = dijkstra.find_path(edgelistDict, currentNode, terminal)
        console.log(path)
    }
}

function initializeSearchTable(edgeListIncoming: Record<number, number[]>, requiredDocuments: number[][], 
    nNodes: number, minNumberResults: number){
    const searchTable: Record<number, INodeInformation> = {};

    for (let i = 0; i < nNodes; i++){
        const onesDocFound: number[][] = requiredDocuments.map(x=>x.map(y=>1));
        const docCostInfinity: number[][] = requiredDocuments.map(x=>x.map(y=>Infinity));
        const resultsFoundInitialised: Record<number, IMinimalCostResult> = {};
        const pathsFoundEmpty: number[][][][] = requiredDocuments.map(x=>x.map(y=>[]));
        // Initialise the 0 results with cost 0, this is used for combinations computation
        resultsFoundInitialised[0] = {cost: 0, edges: []};
        // Initialize all costs with infinity, so they always get overwritten
        for (let j = 0; j < minNumberResults; j++){
            resultsFoundInitialised[j+1] = {cost: Infinity, edges: []}
        }

        searchTable[i] = {
            nResults: 0,
            docFound: onesDocFound, 
            docCost: docCostInfinity, 
            docPaths: pathsFoundEmpty,
            resultInformationTracker: [],
            resultsFound: resultsFoundInitialised
        };
    }
    return searchTable
}

function initializeRelevantDocuments(relevantDocuments: number[][], searchTable: Record<number, INodeInformation>){
    const resultInformationEmpty: IResultInformation[] = [] 
    for (let i = 0; i < relevantDocuments.length; i++){
        const resultInformationI: IResultInformation = {documentsPathCosts: [], paths: [], combinedCost: 0 }
        for (let j = 0; j < relevantDocuments[i].length; j++){
            resultInformationI.documentsPathCosts.push(0);
            resultInformationI.paths.push([]);
            searchTable[relevantDocuments[i][j]].docCost[i][j] = 0;
        }
        resultInformationEmpty.push(resultInformationI);
    }
    for (let k = 0; k < relevantDocuments.length; k++){
        for (let z = 0; z < relevantDocuments[k].length; z++){
            searchTable[relevantDocuments[k][z]].docFound[k][z] = 0
            if (relevantDocuments.length === 1){
                searchTable[relevantDocuments[k][z]].nResults = 1
            }
            searchTable[relevantDocuments[k][z]].resultInformationTracker = resultInformationEmpty
        }
    }
    return searchTable
}


// function updateSingleNode(node: number, searchTable: Record<number, INodeInformation>, 
//     incomingData: INodeInformation, minNumberResults: number){
//     const updatedNodeData: INodeInformation = {
//         nResults: 0, 
//         docFound: [], 
//         docCost: [], 
//         resultInformationTracker: [], 
//         resultsFound: {} 
//     };
//     const currentNodeData = searchTable[node];
//     // Update relevant documents found
//     const newRelevantDocumentsFound = updateDocumentsFound(currentNodeData.docFound, incomingData.docFound);
//     updatedNodeData.docFound = newRelevantDocumentsFound;
//     // Update nResults according to new information
//     updatedNodeData.nResults = getNumResultsFound(newRelevantDocumentsFound);
//     // Update the optimal cost for finding a document
//     currentNodeData.docCost.map((x: number[], i: number) => x.map((y, j) => Math.min(y, incomingData.docCost[i][j]))); 
//     for (let i = 0; i < minNumberResults; i++){

//     }
// }

function updateDocumentsFound(docFound1: number[][], docFound2: number[][]){
    // Element wise AND operation
    const updated = docFound1.map((resultDocuments, i) => 
    resultDocuments.map((document, j) => 
    document && docFound2[i][j]));
    return updated;
}

function getNumResultsFound(relevantDocumentsFound: number[][]){
    const sumWithInitial = relevantDocumentsFound.map(x => x.reduce((a, b) => a + b, 0));
    const newNumResults = sumWithInitial.reduce((a,b) => {
        // If all elements are set to 0, then we dereferenced all needed results and have a solution
        if (b === 0){
            return a + 1
        }
        return a
    }, 0);
    return newNumResults
}

function startSearch(roots: number[], contributingDocuments: number[][], edgeListIncoming: number[][], minNumberResults: number,
    searchTable: Record<number, INodeInformation>){
    // Queue of next nodes to evaluate
    const queue = new Queue<number>();
    // Initialise queue with contributing documents and move upward
    for (let i = 0; i < contributingDocuments.length; i++){
        for (let j = 0; j < contributingDocuments[i].length; j++){
            queue.enqueue(contributingDocuments[i][j])
        }
    }
    while (!queue.isEmpty()){
        const nodeToConsider = queue.dequeue();
        for (const parent of edgeListIncoming[nodeToConsider]){
            propegateUpward(nodeToConsider, parent, contributingDocuments, minNumberResults, searchTable);
            queue.enqueue(parent);
        }
    }
    console.log(JSON.stringify(searchTable[0].docPaths));
}

function propegateUpward(startNode: number, toUpdate: number, contributingDocuments: number[][], minNumberResults: number,
    searchTable: Record<number, INodeInformation>){
    const searchTableEntryStart = searchTable[startNode];
    const searchTableEntryToUpdate = searchTable[toUpdate];

    // Propogate fastest way to get documents, note that this will always be correct, as the fastest way to get a document
    // will update its parent node first.
    const newCost: number[][] = [];
    const newPaths: number[][][][] = [];
    for (let i = 0; i < contributingDocuments.length; i++){
        const costForResult: number[] = [];
        const pathForResult: number[][][] = [];
        // All edges already needed for result
        const pathTakenForResult = searchTableEntryToUpdate.docPaths[i].flat();
        for (let j = 0; j < contributingDocuments[i].length; j++){
            // If both nodes have found the same result, we have to determine best way to get document
            if (searchTableEntryToUpdate.docFound[i][j] === 0 && searchTableEntryStart.docFound[i][j] === 0){
                if (contributingDocuments[i][j] === startNode){
                    costForResult.push(1);
                    pathForResult.push([[toUpdate, startNode]]);
                }
                else{
                    // Find the minimal path for the documents of the two
                    // If the new path is better than already in the target node, we update it with the new path + the edge [toUpdate, startNode]
                    // Here comparison
                    if (searchTableEntryStart.docCost[i][j] + 1 > searchTableEntryToUpdate.docCost[i][j]){
                        let pathAlreadyTaken = false;
                        for (const edge of pathTakenForResult){
                            if (edge[0] == toUpdate && edge[1] == startNode){
                                pathAlreadyTaken = true;
                                continue;
                            }
                        }
                        console.log(pathAlreadyTaken);            
                        if (pathAlreadyTaken){
                            console.log("Were following already taken path")
                            costForResult.push(searchTableEntryStart.docCost[i][j]);
                        }
                        else{
                            costForResult.push(searchTableEntryStart.docCost[i][j] + 1);
                        }        
                        pathForResult.push([[toUpdate, startNode], ...searchTableEntryStart.docPaths[i][j]]);
                    }

                    // If not we keep the path and cost the same, as no new edges are added
                    else{
                        costForResult.push(searchTableEntryToUpdate.docCost[i][j]);
                        pathForResult.push(searchTableEntryToUpdate.docPaths[i][j]);
                    }
                }
                // console.log(pathForResult);
            }
            // If updated node has result but start node doesn't we just copy the previously computed costs and paths
            else if (searchTableEntryToUpdate.docFound[i][j] == 0){
                costForResult.push(searchTableEntryToUpdate.docCost[i][j])
                pathForResult.push(searchTableEntryToUpdate.docPaths[i][j]);
            }
            // If start node only has result we simply increment the cost if we add new edge to path and add one edge to path
            else if (searchTableEntryStart.docFound[i][j] == 0){
                let pathAlreadyTaken = false;
                for (const edge of pathTakenForResult){
                    if (edge[0] == toUpdate && edge[1] == startNode){
                        pathAlreadyTaken = true;
                        continue;
                    }
                }    
                if (pathAlreadyTaken){
                    costForResult.push(searchTableEntryStart.docCost[i][j]);
                }
                else{
                    costForResult.push(searchTableEntryStart.docCost[i][j] + 1);
                }
                pathForResult.push([[toUpdate, startNode], ...searchTableEntryStart.docPaths[i][j]]);
            }
            // If both nodes don't have any way of getting to the doc add empty path and infinite cost
            else{
                pathForResult.push([])
                costForResult.push(Infinity);
            }
        }
        
        console.log(`Start: ${startNode}, toUpdate: ${toUpdate}, result:${i}`)
        console.log("Path for result to update")
        console.log(JSON.stringify(searchTableEntryStart.docPaths));
        console.log(JSON.stringify(searchTableEntryToUpdate.docPaths))
        console.log(JSON.stringify(costForResult))
        console.log(JSON.stringify(pathForResult))
        newCost.push(costForResult)
        newPaths.push(pathForResult);
    }
    searchTableEntryToUpdate.docCost = newCost
    searchTableEntryToUpdate.docPaths = newPaths


    // Propogate found documents
    searchTableEntryToUpdate.docFound = updateDocumentsFound(searchTableEntryToUpdate.docFound, searchTableEntryStart.docFound);
    const numResultsUpdated = getNumResultsFound(searchTableEntryToUpdate.docFound);
    const targetNodeNumSolutionsFound = searchTableEntryToUpdate.nResults;
    const startNodeNumSolutionsFound = searchTableEntryStart.nResults;
    searchTableEntryToUpdate.nResults = numResultsUpdated;
    
    // Propogate the fastest combined way to get n documents with n < k
    // const numNewNodesFound = numResultsUpdated - targetNodeNumSolutionsFound;
    // // If it is the first time we get a result initialize the associated costs with the minimal cost from documents
    // // Again we have to iterate over all possible combinations of results for n > 1 and get cost from combining paths and getting # edges
    // // By deduplicating edges in paths
    // if (targetNodeNumSolutionsFound === 0 && numNewNodesFound > 0){
    //     // Iterate over all new number of results found and get the fastest way to retrieve the documents needed for
    //     for (let n = 0; n < numNewNodesFound; n++){

    //     }
    // }
    // const newCostsForN = []
    // for (let n = 1; n < Math.min(numResultsUpdated+1, minNumberResults+1); n++){
    //     let newMinCost = -1;
    //     if (n === 1){
    //         console.log("N=1")
    //         newMinCost = Math.min(searchTableEntryStart.resultsFound[n].cost, searchTableEntryToUpdate.resultsFound[n].cost);
    //         searchTableEntryToUpdate.resultsFound[n].cost = newMinCost;
    //     }
    //     // If we have more than one result we have to find the cheapest combination of results from the two nodes being combined
    //     if (n >= 2){
    //         let minCostAllCombinations = Infinity;
    //         // console.log("SEP")
    //         // console.log(`n = ${n}`);
    //         // console.log(Array.from(Array(targetNodeNumSolutionsFound).keys()))
    //         // console.log(Array.from(Array(startNodeNumSolutionsFound).keys()))
    //         const combininationToCheck = getCombinationsPossible(
    //             n, 
    //             Array.from(Array(targetNodeNumSolutionsFound).keys()),
    //             Array.from(Array(startNodeNumSolutionsFound).keys())
    //         );
    //         // Find the cheapest way to combine results to find n results
    //         // console.log(combininationToCheck );
    //         for (const combination of combininationToCheck){
    //             // The cost of a combination of results is the minimal cost of that number of results in previous and 
    //             // current node
    //             // console.log(`Combination to consider:`)
    //             // console.log(combination);
    //             const costCombination = searchTableEntryStart.resultsFound[combination[0]].cost +
    //             searchTableEntryToUpdate.resultsFound[combination[1]].cost;
    //             if (costCombination < minCostAllCombinations){
    //                 minCostAllCombinations = costCombination;
    //             }
    //         }
    //         newMinCost = minCostAllCombinations;
    //     }
    //     if (newMinCost === -1){
    //         throw new Error(`Calculated min cost not updated in step. for n=${n}, startNode: ${startNode}, updatedNode: ${toUpdate}`);
    //     }
    //     newCostsForN.push(newMinCost);
    // }
    // for (let n = 1; n < Math.min(numResultsUpdated+1, minNumberResults+1); n++){
    //     searchTableEntryToUpdate.resultsFound[n].cost = newCostsForN[n-1];
    // }
}


function getMaxNumResultsAtNode(){

}

function getCombinationsPossible(n: number, nResults1: number[], nResults2: number[]){
    const allCombinationsSumToN: number[][] = []
    for (let i = 0; i < nResults1.length; i++){
        if (nResults1[i] === n){
            allCombinationsSumToN.push([nResults1[i], 0]);
        }
        for (let j = 0; j < nResults2.length; j++){
            if (nResults1[i] + nResults2[j] === n){
                allCombinationsSumToN.push([nResults1[i], nResults2[j]])
            }
        }
    }
    for (let i = 0; i < nResults2.length; i++){
        if (nResults2[i] === n){
            allCombinationsSumToN.push([0, nResults2[i]]);
        }
        for (let j = 0; j < nResults1.length; j++){
            if (nResults2[i] + nResults1[j] === n){
                allCombinationsSumToN.push([nResults1[j], nResults2[i]])
            }
        }
    }
    return allCombinationsSumToN;
}
// function getShortestPathFromRootToAllDocuments(root: number, documents: number[][], 
//     edgeListDijkstra: Record<number, Record<number, number>>): IShortestPaths {
//         const shortestPaths: number[][][] = [];
//         const costs: number[][] = [];
//         for (let i = 0; i < documents.length; i++){
//             const shortestPathsOneResult = [];
//             const costsOneResult = [];
//             for (let j = 0; j < documents[i].length; j++){
//                 let shortestPath = dijkstra.find_path(edgeListDijkstra, root, documents[i][j]);
//                 shortestPath = shortestPath.map((x: any) => Number(x));

//                 shortestPathsOneResult.push(shortestPath);
//                 costsOneResult.push(shortestPath.length);
//             }
//             shortestPaths.push(shortestPathsOneResult);
//             costs.push(costsOneResult);
//         }
//     return {shortestPaths: shortestPaths, costs: costs};
// }


function main(edgeListIncoming: number[][], relevantDocuments: number[][], nNodes: number, minNumberResults: number){
    let searchTable = initializeSearchTable(edgeListIncoming, relevantDocuments, nNodes, minNumberResults);
    searchTable = initializeRelevantDocuments(relevantDocuments, searchTable);
    startSearch([0], relevantDocuments, edgeListIncoming, minNumberResults, searchTable)
}
// const a = [[0,0,1], [1,1,0], [1,1,1], [0,1,1], [0,0,0]]
// const b = [[1,1,0], [1,1,1], [0,1,0], [1,1,1], [0,0,0]]
// const costA = [[2,5,3], [7,8, 9]];
// const costB = [[3,4,2], [12, 6, 4]];
// const updated = updateDocumentsFound(a, b);
// const numResultsFound = getNumResultsFound(updated)
// console.log(updated)
// console.log(numResultsFound)
const testCase = [[1, 5, 6], [2], [3, 4], [], [5], [], [7, 8], [9, 10], [], [], []];
const incomingEdges = [[], [0], [1], [2], [2], [4, 0], [0], [6], [6], [7], [7], [8, 7]]
const relevantNodes = [[1,5], [3], [9], [7], [9, 8], [9, 7], [9, 7, 11]];
// const inputTestCase = convertToDijkstraInput(testCase);
// [[], [0], [0], [1], [3], [4,2], [ 5 ], [ 4 ]]
const incomingEdgesCase2 = [[], [0], [0], [1], [3], [3, 2], [5]]
const relevantNodes2 = [[4, 6], [4, 2, 6]]

const incomingEdgesCase3 = [[], [0], [0], [1], [2], [3], [4], [5,8], [6], [8]];
const relevantNodes3 = [[3,7,9]]
main(incomingEdgesCase3, relevantNodes3, incomingEdgesCase3.length, 1);
// main(incomingEdges, relevantNodes, 12, 3);

export interface IMinimalCostResult{
    /**
     * Cost of minimal cost result
     */
    cost: number,
    /**
     * Edges to find the minimal cost result
     */
    edges: number[][]
}

export interface INodeInformation{
    /**
     * Results found
     */
    nResults: number,
    /**
     * Documents found at node, 0 indicates the document is found, 1 indicates it is not
     */
    docFound: number[][]
    /**
     * Paths to get to document in the form of [result[documents[edges[start, end]]]] (assume weight is always 1)
     */
    docPaths: number[][][][]
    /**
     * Document information tracking
     */
    resultInformationTracker: IResultInformation[]
    /**
     * So far minimal cost to find each document
     */
    docCost: number[][]
    /**
     * Dictionary to track the minimal cost for the number of results in key
     */
    resultsFound: Record<number, IMinimalCostResult>
}

export interface IResultInformation{
    documentsPathCosts: number[]
    paths: number[][]
    combinedCost: number
}