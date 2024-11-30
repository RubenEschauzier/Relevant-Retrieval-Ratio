# Relevant Retrieval Ratio

This repository contains the code required to compute the Relevant Retrieval Ratio (R^3), an implementation agnostic link prioritization performance metric that compares prioritization algorithms to an optimal oracle algorithm.

## Installation

To install the necessary dependencies, run the following command:

```bash
    yarn install
```


## Usage

The metric's computation is handled in the class `RunLinkTraversalPerformanceMetrics`. The method `RunMetricAll` computes the STLR and requires the following inputs:

- **Edgelist**: Represents the queried topology.

- **Relevant Document Sets**: The sets of documents needed to produce each result.

- **Traversal Path**: The path taken by the engine during traversal.

- **Seed Documents**: The initial documents from which the traversal starts.

To run the solver, the input edgelist, root documents, and query-relevant documents are written to a file in .stp format located in `heuristic-solver/input/full-topology/`. The solver then reads this file and returns the heuristically optimal traversal path.

## Example Implementation

We provide an example implementation of an engine that tracks the data required for the metric and a benchmark runner that calculates the metric for all issued queries.
Steps:

1. **Information Tracking Implementation**:
    Implement information tracking in the following branches of Comunica and Comunica link traversal.
    These development versions need to be linked together by adding the `/packages` and `/engines` folders to the workspaces of Comunica link traversal.

2. **Running the Metric Calculation**:
    Start an endpoint with the provided Comunica link traversal implementation and let the benchmark runner run queries against the endpoint. This will automatically calculate the metric.

## Notes:

This example implementations are based on Comunica V2 and (very) messy. We are in the process of updating our implementation and getting the required changes merged into the master branches of these engines. This will allow for **much** easier computation of the metrics in the future.
