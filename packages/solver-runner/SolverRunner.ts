import {BindingsStream} from "@comunica/types";
import {Bindings} from "@comunica/bindings-factory";
import { TraversedGraph } from "@comunica/actor-construct-traversed-topology-url-to-graph"
import * as fs from "fs"; 
import { exec } from "child_process";
import * as util from "util";


class SolverRunner{
    public engine: any;
    public queryEngine: any;
    public execPromise: Function;

    public constructor(){
      this.queryEngine = require("@comunica/query-sparql-link-traversal-solid").QueryEngine;
      this.execPromise = util.promisify(exec);
    }

    /**
     * Function to write edge list and relevant documents to format specified here
     * https://steinlib.zib.de/format.php
     */

    public writeDirectedTopologyToFile(trackedTopology: TraversedGraph, edgeList: number[][], relevantDocuments: string[], outputPath: string){
        // const edgeList = trackedTopology.getEdgeList();
        const metadata = trackedTopology.getMetaDataAll();
        const nodeToIndex = trackedTopology.getNodeToIndexes();
        edgeList.sort(function(a,b){return a[1] - b[1];});
        
        let graphString = `33D32945 STP File, STP Format Version 1.0\n`;
        graphString += `SECTION Comment
        Name    "Traversed Topology"
        Creator "Ruben Eschauzier"
        Problem "SAP"
        Remark  "Traversed topology during Link Traversal-based Query Processing"
        END\n\n`;
        graphString += `SECTION Graph \nNodes ${metadata.length}\nEdges ${edgeList.length}\n`;
        // Iterate over the edges and add to string
        for (let i=0; i < edgeList.length; i++){
          const antiParallelEdge = [edgeList[i][1], edgeList[i][0], edgeList[i][2]];
          // If the graph contains an anti parallel edge, make weight of fourth number 1
          let edgeString = "";
          if (edgeList.includes(antiParallelEdge)){
            edgeString = `A ${edgeList[i][0]+1} ${edgeList[i][1]+1} ${edgeList[i][2]} 1\n`
          }
          else{
            edgeString = `A ${edgeList[i][0]+1} ${edgeList[i][1]+1} ${edgeList[i][2]} 200000\n`;
          }
          graphString += edgeString;
        }
        graphString += "END\n\n";
        let numRoots = 0;
        for (let k = 0; k < metadata.length; k++){
          if (!metadata[k].hasParent){
            numRoots += 1;
          }
        }
  
        // Add terminals (contributing documents)
        graphString += `SECTION Terminals\nTerminals ${relevantDocuments.length + numRoots}\n`;
        // All non-parent nodes are root nodes in this problem.
        for (let k = 0; k < metadata.length; k++){
          if (!metadata[k].hasParent){
            graphString += `Root ${k+1}\n`
          }
        }
        for (let k = 0; k < metadata.length; k++){
          if (!metadata[k].hasParent){
            graphString += `T ${k+1}\n`
          }
        }
        for (let j = 0; j < relevantDocuments.length; j++){
          const terminalIndex = nodeToIndex[relevantDocuments[j]] + 1;
          graphString += `T ${terminalIndex}\n`
        }
        graphString += `END\n\nEOF`
        fs.writeFileSync(outputPath, graphString);
      }
  
      /**
       * Function that writes the full optimal graph problem with a subset of nodes as a .stp file for the solver. This is used to calculate the fastest
       * path to first K results.
       * 
       * @param trackedTopology 
       * @param optimalPathEdges 
       * @param relevantDocuments 
       * @param outPath 
       */

      public writeDirectedTopologyFileReduced(
        trackedTopology: TraversedGraph,
        edgeList: number[][], 
        optimalPathEdges: number[][], 
        relevantDocuments: number[], 
        nodesFullToReduced: Record<number, number>,
        outputPath: string){
        const metadata = trackedTopology.getMetaDataAll();
        const edgeListOriginalOneIndexedNoWeights = edgeList.map(x=>[x[0]+1, x[1]+1]);
        const nodesVisited = Array.from(new Set(optimalPathEdges.flat()));

        let graphString = `33D32945 STP File, STP Format Version 1.0\n`;
        graphString += `SECTION Comment
        Name    "Topology of optimal path"
        Creator "Ruben Eschauzier"
        Remark  "A graph representation of the optimal traversal path to take to dereference all relevant documents. The terminals represent a subset of all relevant documents."
        END\n\n`;

        graphString += `SECTION Graph \nNodes ${nodesVisited.length}\nEdges ${optimalPathEdges.length}\n`;

        for (let i=0; i < optimalPathEdges.length; i++){
          // We have to find the origin edge list corresponding to a solution edge, as in the solution the weights are discarded
          const indexEdge = this.getOccurenceIndexEdge(edgeListOriginalOneIndexedNoWeights, optimalPathEdges[i]);
          if (indexEdge === -1){
            console.error("Invalid index encountered");
          }
          // Original edges from full problem are 0 indexed
          const originalEdge = [
          nodesFullToReduced[edgeList[indexEdge][0]+1], 
          nodesFullToReduced[edgeList[indexEdge][1]+1], 
          edgeList[indexEdge][2]
          ];

          const antiParallelEdge = [originalEdge[1], originalEdge[0], originalEdge[2]];
          // If the graph contains an anti parallel edge, make weight of fourth number 1
          let edgeString = "";
          if (optimalPathEdges.includes(antiParallelEdge)){
            edgeString = `A ${originalEdge[0]} ${originalEdge[1]} ${originalEdge[2]} 1\n`;
          }
          else{
            edgeString = `A ${originalEdge[0]} ${originalEdge[1]} ${originalEdge[2]} 200000\n`;
          }
          graphString += edgeString;
        }
        graphString += "END\n\n";

        let numRoots = 0;
        for (let k = 0; k< nodesVisited.length; k++){
          if (!metadata[nodesVisited[k]-1].hasParent){
            numRoots += 1;
          }
        }
        // Add terminals (contributing documents)
        graphString += `SECTION Terminals\nTerminals ${relevantDocuments.length + numRoots}\n`;
        // All non-parent nodes are root nodes in this problem.
        for (let k = 0; k < nodesVisited.length; k++){
          if (!metadata[nodesVisited[k]-1].hasParent){
            graphString += `Root ${nodesFullToReduced[nodesVisited[k]]}\n`;
          }
        }

        for (let k = 0; k < nodesVisited.length; k++){
          if (!metadata[nodesVisited[k]-1].hasParent){
            graphString += `T ${nodesFullToReduced[nodesVisited[k]]}\n`;
          }
        }

        for (let j = 0; j < relevantDocuments.length; j++){
          graphString += `T ${nodesFullToReduced[relevantDocuments[j]]}\n`;
        }
        graphString += `END\n\nEOF`;
        fs.writeFileSync(outputPath, graphString);
      }

      public getOccurenceIndexEdge(edgeList: number[][], edge: number[]){
        for (let i = 0; i < edgeList.length; i++){
          if (edgeList[i].length === edge.length && edgeList[i][0] === edge[0] && edgeList[i][1] === edge[1]){
            return i;
          }
        }
        return -1;
      }

      // Note that outputDirectedTopology and the output in solver/write.set must be equal (should prob just set solver/write.set output to outputDirectedTopology)
      public async runSolver(solverLocation: string, inputFileLocation: string, settingFileLocation: string){
        const {stdout, stderr} = await this.execPromise(
        `./${solverLocation} -f ${inputFileLocation} -s ${settingFileLocation}`).catch((err: any)=>{console.log(err)});
        return stderr;
      }
  
      public parseSolverResult(solverResultFileLocation: string): ISolverOutput{
        const data = fs.readFileSync(solverResultFileLocation, {encoding: "utf-8"});
        // Solver result will always have solution after header SECTION Finalsolution
        const result_section = data.split('SECTION Finalsolution')[1].split("End")[0];
        const edgeInfo = result_section.split("Edges")[1];
        const totalEdges = edgeInfo.split("\n")[0];
        const edgesInSolution = edgeInfo.split("\n").slice(1, edgeInfo.split("\n").length-1);
        const edgesAsList = edgesInSolution.map(x=>x.split(' ').slice(1).map(y => Number(y)));
        return {nEdges: Number(totalEdges), edges: edgesAsList};
      }
}  


export interface ISolverOutput{
    /**
     * Number of edges in the solution
     */
    nEdges: number
    /**
     * The edges that represent optimal traversal of the topology
     */
    edges: number[][]
}
export { SolverRunner };
