import * as fs from 'fs';
import * as path from 'path';

var dijkstra = require('dijkstrajs');

const dataTopology = JSON.parse(fs.readFileSync(path.join(__dirname, "../../log/topologyQuery0.txt"), 'utf8'));
const metricInput = JSON.parse(fs.readFileSync(path.join(__dirname, "../../log/metricInput0.txt"), 'utf8'));


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

function initSteinerTable(terminals: number[], edgeList: number[][]){
    const C = terminals.slice(1, terminals.length-1);
    console.log(C);
}
function DPTransition(edges: number[][], terminalsVisited: number[], nodesVisited: number[], terminalsReachable: number[], u: number){
    nodesVisited.push(u);
    if (u in terminalsReachable){
        terminalsVisited.push(u);
    }
    if (edges){

    }
}

const edges = dataTopology.edgeListUnWeighted;
const terminals = metricInput.contributingNodes;
const roots = metricInput.roots;

const inputDijkstra = convertToDijkstraInput(edges);
console.log(inputDijkstra);
console.log(dijkstra.find_path(inputDijkstra, '1', '3'));
// DPTransition(edges, [], [], terminals, roots[0]);

// console.log(edges)
// console.log(terminals)
// console.log(roots)