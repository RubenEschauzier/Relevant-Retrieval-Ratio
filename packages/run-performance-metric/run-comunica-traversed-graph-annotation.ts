import {BindingsStream} from "@comunica/types";
import {Bindings} from "@comunica/bindings-factory";
import {KeysBindingContext} from "@comunica/context-entries";
import {KeysTraversedTopology} from "@comunica/context-entries-link-traversal";
import { ActionContext } from '@comunica/core';
import { TraversedGraph } from "@comunica/actor-construct-traversed-topology-url-to-graph"
import * as fs from "fs"; 
import { exec, execFile } from "child_process";

// Steiner tree solver: https://steinlib.zib.de/format.php   -------- https://scipjack.zib.de/#download
class runExperiments{
    public engine: any;
    public queryEngine: any;
    public constructor(){
      this.queryEngine = require("@comunica/query-sparql-link-traversal-solid").QueryEngine;
    }

    public async createEngine(){
      // this.engine = await new this.queryEngineFactory().create({configPath: "configFiles/config-default-variable-priorities.json"});
      this.engine = new this.queryEngine();
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
      console.log(resultSources);
      return resultSources
    }

    public async consumeStream(bindingStream: BindingsStream, dataProcessingFunction: Function){
        let numResults = 0;
        const bindings: any[] = [];
        const processingResults: any[] = []
        const finishedReading: Promise<any[]> = new Promise((resolve, reject) => {
            bindingStream.on('data', (res: any) => {
                const processingOutput = dataProcessingFunction(res);
                processingResults.push(processingOutput)
                numResults += 1;
                console.log(`Here is data: ${res}`)
                console.log(typeof(res))
            });
            bindingStream.on('end', () =>{
                resolve(processingResults)
            });
            bindingStream.on('error', () =>{
                reject(true)
            });
        });
        return finishedReading
    }
    /**
     * Function to write edge list and relevant documents to format specified here
     * https://github.com/PACE-challenge/SteinerTree-PACE-2018-instances/blob/master/Track1/instance001.gr#L4
     */
    public writeTopologyToFile(trackedTopology: TraversedGraph, relevantDocuments: string[], outputPath: string){
      const edgeList = trackedTopology.getEdgeList();
      const metadata = trackedTopology.getMetaDataAll();
      const nodeToIndex = trackedTopology.getNodeToIndexes();
      edgeList.sort(function(a,b){return a[0] - b[0];});
      fs.writeFileSync("contributingTest.txt", JSON.stringify(relevantDocuments.map(x=>nodeToIndex[x])));
      fs.writeFileSync("edgeList.txt", JSON.stringify(edgeList));

      
      let graphString = ``;
      graphString += `SECTION Graph \nNodes ${metadata.length}\nEdges ${edgeList.length}\n`;
      // Iterate over the edges and add to string
      for (let i=0; i < edgeList.length; i++){
        const edgeString = `E ${edgeList[i][0]} ${edgeList[i][1]} ${edgeList[i][2]} \n`;
        graphString += edgeString;
      }
      graphString += "END \n \n";
      // Add terminals (contributing documents)
      graphString += `SECTION Terminals \nTerminals ${relevantDocuments.length} \n`
      for (let j = 0; j < relevantDocuments.length; j++){
        const terminalIndex = nodeToIndex[relevantDocuments[j]];
        graphString += `T ${terminalIndex}\n`
      }
      graphString += `END\n\nEOF`

      fs.writeFileSync(outputPath, graphString);
      console.log(graphString)
    }
    public writeDirectedTopologyToFile(trackedTopology: TraversedGraph, relevantDocuments: string[], outputPath: string){
      const edgeList = trackedTopology.getEdgeList();
      const metadata = trackedTopology.getMetaDataAll();
      const nodeToIndex = trackedTopology.getNodeToIndexes();
      edgeList.sort(function(a,b){return a[0] - b[0];});
      
      let graphString = ``;
      graphString += `SECTION Graph \nNodes ${metadata.length}\nEdges ${edgeList.length}\n`;
      // Iterate over the edges and add to string
      for (let i=0; i < edgeList.length; i++){
        const antiParallelEdge = [edgeList[i][1], edgeList[i][0], edgeList[i][2]];
        // If the graph contains an anti parallel edge, make weight of fourth number 1
        let edgeString = "";
        if (edgeList.includes(antiParallelEdge)){
          edgeString = `A ${edgeList[i][0]+1} ${edgeList[i][1]+1} ${edgeList[i][2]} 1 \n`
        }
        else{
          edgeString = `A ${edgeList[i][0]+1} ${edgeList[i][1]+1} ${edgeList[i][2]} 1000000 \n`;
        }
        graphString += edgeString;
      }
      graphString += "END \n \n";
      // Add terminals (contributing documents)
      graphString += `SECTION Terminals \nTerminals ${relevantDocuments.length} \n`;
      // All non-parent nodes are root nodes in this problem.
      for (let k = 0; k < metadata.length; k++){
        if (!metadata[k].hasParent){
          graphString += `Root ${k+1}\n`
        }
      }
      for (let j = 0; j < relevantDocuments.length; j++){
        const terminalIndex = nodeToIndex[relevantDocuments[j]] + 1;
        graphString += `T ${terminalIndex}\n`
      }
      graphString += `END\n\nEOF`

      fs.writeFileSync(outputPath, graphString);
    }

    public runSolver(){
      exec("./solver/st-exact < solver/testFile.gr > solver/optimalPath.ost", (error: any, stdout: any, stderr: any ) => {
        console.log(error);
      });
    }

}

const query = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
SELECT ?messageId ?messageCreationDate ?messageContent WHERE {
  ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000000000000000933/profile/card#me>;
    rdf:type snvoc:Post;
    snvoc:content ?messageContent;
    snvoc:creationDate ?messageCreationDate;
    snvoc:id ?messageId.
} `;
const discover_6_1 = `PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
SELECT DISTINCT ?forumId ?forumTitle WHERE {
  ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000000000000000933/profile/card#me>.
  ?forum snvoc:containerOf ?message;
    snvoc:id ?forumId;
    snvoc:title ?forumTitle.
}`

const discover_8_5 = `PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
SELECT DISTINCT ?creator ?messageContent WHERE {
  <https://solidbench.linkeddatafragments.org/pods/00000006597069767117/profile/card#me> snvoc:likes _:g_0.
  _:g_0 (snvoc:hasPost|snvoc:hasComment) ?message.
  ?message snvoc:hasCreator ?creator.
  ?otherMessage snvoc:hasCreator ?creator;
    snvoc:content ?messageContent.
}
LIMIT 10`

const discover_3_5 = `PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?tagName (COUNT(?message) AS ?messages) WHERE {
  ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000006597069767117/profile/card#me>;
    snvoc:hasTag ?tag.
  ?tag foaf:name ?tagName.
}
GROUP BY ?tagName
ORDER BY DESC (?messages)`


const discover_4_5 = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX snvoc: <https://solidbench.linkeddatafragments.org/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?locationName (COUNT(?message) AS ?messages) WHERE {
  ?message snvoc:hasCreator <https://solidbench.linkeddatafragments.org/pods/00000006597069767117/profile/card#me>;
    rdf:type snvoc:Comment;
    snvoc:isLocatedIn ?location.
  ?location foaf:name ?locationName.
}
GROUP BY ?locationName
ORDER BY DESC (?messages)`

const runner = new runExperiments();
runner.createEngine().then(async () => {
    const queryOutput = await runner.engine.query(query, {idp: "void", 
    "@comunica/bus-rdf-resolve-hypermedia-links:annotateSources": "graph", unionDefaultGraph: true, lenient: true, constructTopology: true});
    const bindingStream = await queryOutput.execute();
    const mediatorConstructTraversedTopology = await queryOutput.context.get(KeysTraversedTopology.mediatorConstructTraversedTopology);
    // This returns an object with the topology object in it, this will contain the topology after executing the query
    const constuctTopologyOutput = await mediatorConstructTraversedTopology.mediate(
      {
        parentUrl: "",
        links: [],
        metadata: [{}],
        setDereferenced: false,
        context: new ActionContext()
    });
    // Execute entire query, should be a promise with timeout though
    const bindings: Bindings[] = await bindingStream.toArray();
    const contributingDocuments = runner.extractContributingDocuments(bindings);
    runner.writeDirectedTopologyToFile(constuctTopologyOutput.topology, contributingDocuments.flat(), "solver/traversalTopology.gr")
    runner.runSolver();
});

