import * as d3 from "d3";

const NUM_SHADES = 30;

// Get a range of colors.
const tmpScale = d3
  .scaleLinear<string, number>()
  .domain([0, 0.5, 1])
  .range(["#f59322", "#e8eaeb", "#0877bd"])
  .clamp(true);

// Due to numerical error, we need to specify
// d3.range(0, end + small_epsilon, step)
// in order to guarantee that we will have end/step entries with
// the last element being equal to end.
const colors = d3.range(0, 1 + 1e-9, 1 / NUM_SHADES).map((a) => tmpScale(a));

const color = d3.scaleQuantize().domain([-1, 1]).range(colors);

/**
 * Compute classification metrics.
 * @param yPred Estimated target value.
 * @param yTrue Correct target value.
 */
function getClfMetrics(yPred: number[], yTrue: number[]) {
  if (yPred.length !== yTrue.length) {
    throw Error("Length of predictions must equal length of labels");
  }

  // 4 elements of a confusion matrix.
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (let i = 0; i < yPred.length; i++) {
    const pred = yPred[i];
    const label = yTrue[i];

    if (pred === -1 && label === -1) tn++;
    else if (pred === -1 && label === 1) fn++;
    else if (pred === 1 && label === -1) fp++;
    else if (pred === 1 && label === 1) tp++;
    else throw Error("Predicted or true class value is invalid");
  }

  return {
    Accuracy: (tp + tn) / (tp + tn + fp + fn),
    Precision: tp / (tp + fp),
    Recall: tp / (tp + fn),
  };
}

export { color, getClfMetrics };
