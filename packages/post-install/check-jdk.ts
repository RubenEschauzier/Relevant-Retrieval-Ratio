import { exec } from "child_process";

exec('java -version', (error, stdout, stderr) => {
  if (error) {
    console.log('Java is not installed. Please install the Java Development Kit (JDK).');
    console.log('For installation instructions, visit: https://adoptopenjdk.net/');
    process.exit(1);
  } else {
    if (stdout){
      console.log(stdout)
    }
    console.log(stderr.trim())
    console.log('Java is installed.');
  }
});
