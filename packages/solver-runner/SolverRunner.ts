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

  public writeDirectedTopologyToFile(
    edgeList: number[][],
      relevantDocuments: number[][], 
      roots: number[], 
      numNodes: number, 
      outputPath: string
    ){
    edgeList.sort((a,b) => a[0] - b[0]);
    const flatRelevantDocuments = relevantDocuments.flat();
    // Add both roots and relevant documents to one set, to account for a relevant document being a root
    const terminals = new Set([...flatRelevantDocuments, ...roots]);
    const terminalsArray = Array.from(terminals);
    terminalsArray.sort((a, b) => a - b);

    
    let graphString = `33D32945 STP File, STP Format Version 1.0\n`;
    graphString += `SECTION Comment
    Name    "Traversed Topology"
    Creator "Ruben Eschauzier"
    Problem "SAP"
    Remark  "Traversed topology during Link Traversal-based Query Processing"
    END\n\n`;
    graphString += `SECTION Graph \nNodes ${numNodes}\nArcs ${edgeList.length}\n`;
    // Iterate over the edges and add to string
    for (let i=0; i < edgeList.length; i++){
      // If the graph contains an anti parallel edge, make weight of fourth number 1
      const edgeString = `A ${edgeList[i][0]} ${edgeList[i][1]} ${edgeList[i][2]}\n`
      graphString += edgeString;
    }
    graphString += "END\n\n";

    // Add terminals (contributing documents)
    graphString += `SECTION Terminals\nTerminals ${terminalsArray.length}\n`;
    // All non-parent nodes are root nodes in this problem.
    for (let k = 0; k < roots.length; k++){
      graphString += `Root ${roots[k]}\n`
    }
    for (let k = 0; k < terminalsArray.length; k++){
      graphString += `T ${terminalsArray[k]}\n`
      
    }
    graphString += `END\n\nEOF`
    fs.writeFileSync(outputPath, graphString);
  }

  /**
   * 
   * @param solverLocation Path from /package directory to the solver location (src/)
   * @param pathFromSolverLocationToInputDir Path from src/ to the directory with inputs, in this case: ../input/. Note this has to end with /
   * @param sub_dir Sub dir with the data needed to run solver, start without /, end with /. In standard case full_topology/
   */
  public async runSolverHeuristic(solverLocation: string, pathFromSolverLocationToInputDir: string, sub_dir: string){
    const {stdout, stderr} = await this.execPromise(
      `cd ${solverLocation} && javac Main.java && java Main ${pathFromSolverLocationToInputDir} ${sub_dir}`
      ).catch((err: any) =>{
        console.log(err)
      }) 
    return stdout
  }

  public parseSolverResultHeuristic(stdoutHeuristic: string): ISolverOutput{
    const reg = /^A \d+ \d+$/gm;
    const edges = stdoutHeuristic.match(reg);
    const edgesAsNumber = edges!.map(x => [Number(x.split(' ')[1]), Number(x.split(' ')[2])]);
    edgesAsNumber.sort((a,b) => a[0]-b[0]);
    if (!edges){
      console.error("Solver found solution with no edges")
    }
    return {nEdges: edges!.length, edges: edgesAsNumber, optimalCost: 0}
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
    /**
     * Optimal cost of steiner tree
     */
    optimalCost: number;
}
export { SolverRunner };
