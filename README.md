# Relevant Retrieval Ratio

This repository contains the code required to compute the Relevant Retrieval Ratio ($R^3$), an implementation-agnostic link prioritization performance metric that compares prioritization algorithms to an optimal oracle algorithm.

## Installation

To install the necessary dependencies, run the following command:

```bash
    yarn install
```

Additionally, this package requires the JDK. 


## Usage

The metric's computation is handled in the class `RunLinkTraversalPerformanceMetrics`. The method `RunMetricAll` computes the $R^{3}$ value and requires the following inputs:

- **Edgelist**: Represents the queried topology. Expects edges as arrays of numbers corresponding to nodes in the following format `[start, end, weight]`

- **Relevant Document Sets**: The document sets needed to produce each result (as node indexes).

- **Traversal Path**: The path taken by the engine during traversal. Expects edges as arrays of numbers in the following format [start, end, weight]

- **Seed Documents**: The initial documents from which the traversal starts (as node indexes).

To run the solver, the input edgelist, root documents, and query-relevant documents are written to a file in .stp format located in `heuristic-solver/input/full-topology/`. The solver then reads this file and returns the heuristically optimal traversal path.

