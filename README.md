# metric-link-prioritisation-performance
Code for computing a non-deterministic link prioritisation performance metric that is implementation agnostic.


The input for the solver is stored in heuristic-solver/input/full-topology usually. It includes an example topology file.
By default this will be overwritten when computing the metric for all results as this will generate a new input-file.stp from the passed topology.
To be sure everything goes well users should empty this directory before running their experiments.