/* Copyright 2016 Google Inc. All Rights Reserved.
Modifications Copyright 2022 Anas Elbaza.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import * as d3 from "d3";
import "seedrandom";
import "material-design-lite";
import "material-design-lite/dist/material.indigo-blue.min.css";
import "./styles.css";
import Worker from "worker-loader!./train.worker";
import { HeatMap } from "./heatmap";
import { State, datasets, getKeyFromValue, Problem } from "./state";
import { DataGenerator, Example2D, shuffle } from "./dataset";
import * as Utils from "./metrics";
("use strict");
import SVM from "libsvm-js/asm.js";

const NUM_SAMPLES_CLASSIFY = 500;
const NUM_SAMPLES_REGRESS = 0;
// Size of the heatmaps.
const SIDE_LENGTH = 300;
// # of points per direction.
const DENSITY = 100;

const state = State.deserializeState();
const xDomain: [number, number] = [-6, 6];
// Label values must be scaled before and after training since svm impl does not
// accepts negative values.
const inputScale = d3.scaleLinear().domain([-1, 1]).range([0, 1]);
const outputScale = d3.scaleLinear().domain([0, 1]).range([-1, 1]);

// Plot the main heatmap.
const mainHeatMap = new HeatMap(
  SIDE_LENGTH,
  DENSITY,
  xDomain,
  xDomain,
  d3.select("#main-heatmap"),
  { showAxes: true }
);

// Plot the output heatmap.
const outputHeatMap = new HeatMap(
  SIDE_LENGTH,
  DENSITY,
  xDomain,
  xDomain,
  d3.select("#output-heatmap"),
  { showAxes: true }
);
const colorScale = d3
  .scaleLinear<string, number>()
  .domain([-1, 0, 1])
  .range(["#f59322", "#e8eaeb", "#0877bd"])
  .clamp(true);

let trainWorker: Worker;
let options;
let model;
let data: Example2D[];
let uploadedData: Example2D[];
let trainData: Example2D[];
let testData: Example2D[];
let metricList = [];
let getMetrics: (yPred: number[], yTrue: number[]) => any;
let trainMetrics;
let testMetrics;
let mainBoundary: number[][];
let kernel: string = "POLYNOMIAL";

/**
 * Prepares the UI on startup.
 */
function makeGUI() {
  d3.select("#start-button").on("click", () => {
    isLoading(true);

    trainWorker.terminate();
    trainWorker = new Worker();
    trainWorker.postMessage({
      options: options,
      trainingSet: trainData.map((d) => [d.x, d.y]),
      labels: trainData.map((d) => inputScale(d.label)),
    });
    trainWorker.onmessage = (msg: MessageEvent) => {
      model = SVM.load(msg.data);
      trainData.map((d) => [d.x, d.y]);
      trainData.map((d) => inputScale(d.label));
      isClassification();

      const predictions: number[] = new Array(data.length);
      const svmPredictions: number[] = model.predict(
        data.map((d) => [d.x, d.y])
      );

      svmPredictions.forEach((element, index) => {
        let x = -1;
        if (element === 0) {
          svmPredictions[index] = x;
        }
        predictions[index] = svmPredictions[index];
      });

      for (let i = 0; i < predictions.length; i++) {
        const pred = predictions[i];
        data[i]["voteCounts"] = data[i]["voteCounts"] || [0, 0];
        // Increment the vote count of each class.
        if (pred === -1) data[i]["voteCounts"][0]++;
        else if (pred === 1) data[i]["voteCounts"][1]++;
        else throw new Error("Vote is invalid");
      }
      [trainData, testData] = splitTrainTest(data);
      const [trainPredictions, testPredictions] = splitTrainTest(predictions);
      const labeles = data.map((d) => d.label);
      const [trainLabeles, testLabeles] = splitTrainTest(labeles);

      trainMetrics = getMetrics(trainPredictions, trainLabeles);
      testMetrics = getMetrics(testPredictions, testLabeles);

      updateUI();
      isLoading(false);
    };
  });

  /* Data column */
  d3.select("#data-regen-button").on("click", () => {
    generateData();
    reset();
  });

  const dataThumbnails = d3.selectAll("canvas[data-dataset]");
  dataThumbnails.on("click", function () {
    const newDataset = datasets[(this as HTMLElement).dataset.dataset];
    if (newDataset === state.dataset) {
      return; // No-op.
    }
    state.dataset = newDataset;
    dataThumbnails.classed("selected", false);
    d3.select(this).classed("selected", true);
    generateData();
    reset();
  });

  const datasetKey = getKeyFromValue(datasets, state.dataset);
  // Select the dataset according to the current state.
  d3.select(`canvas[data-dataset=${datasetKey}]`).classed("selected", true);

  /* Top Contents */
  // Configure the value of parameter C
  const parameterC = d3.select("#parameterC").on("input", function () {
    const element = this as HTMLInputElement;
    state.parameterC = +element.value;
    d3.select("label[for='parameterC'] .value").text(element.value);
    reset();
  });
  parameterC.property("value", state.parameterC);
  d3.select("label[for='parameterC'] .value").text(state.parameterC);

  // Configure the polynomial degree.
  const polyDegree = d3.select("#polyDegree").on("input", function () {
    const element = this as HTMLInputElement;
    state.polyDegree = +element.value;
    d3.select("label[for='polyDegree'] .value").text(element.value);
    reset();
  });
  polyDegree.property("value", state.polyDegree);
  d3.select("label[for='polyDegree'] .value").text(state.polyDegree);

  // Configure the value of gamma parameter.
  const gamma = d3.select("#gamma").on("input", function () {
    const element = this as HTMLInputElement;
    state.gamma = +element.value;
    d3.select("label[for='gamma'] .value").text(element.value);
    reset();
  });
  gamma.property("value", state.gamma);
  d3.select("label[for='gamma'] .value").text(state.gamma);

  //controle the range slider
  const activation = d3.select("#activations").on("change", function () {
    const element = this as HTMLInputElement;
    state.activation = +element.value;
    d3.select("label[for='activations'].value").text(element.value);
    if (element.value.toUpperCase() === "LINEAR") {
      (document.getElementById("gamma") as HTMLInputElement).disabled = true;
      (document.getElementById("polyDegree") as HTMLInputElement).disabled =
        true;
      kernel = "LINEAR";
    } else if (element.value.toUpperCase() === "RBF") {
      (document.getElementById("gamma") as HTMLInputElement).disabled = false;
      (document.getElementById("polyDegree") as HTMLInputElement).disabled =
        true;
      kernel = "RBF";
    } else {
      (document.getElementById("gamma") as HTMLInputElement).disabled = false;
      (document.getElementById("polyDegree") as HTMLInputElement).disabled =
        false;
      kernel = "POLYNOMIAL";
    }
    reset();
  });

  const showTestData = d3.select("#show-test-data").on("change", function () {
    state.showTestData = (this as HTMLInputElement).checked;
    state.serialize();
    outputHeatMap.updateTestPoints(state.showTestData ? testData : []);
  });
  // Check/uncheck the checkbox according to the current state.
  showTestData.property("checked", state.showTestData);

  const discretize = d3.select("#discretize").on("change", function () {
    state.discretize = (this as HTMLInputElement).checked;
    state.serialize();
    mainHeatMap.updateBackground(mainBoundary, state.discretize);
  });
  // Check/uncheck the checbox according to the current state.
  discretize.property("checked", state.discretize);

  /* Data configurations */
  // Configure the ratio of training data to test data.
  const percTrain = d3.select("#percTrainData").on("input", function () {
    const element = this as HTMLInputElement;
    state.percTrainData = +element.value;
    d3.select("label[for='percTrainData'] .value").text(element.value);
    reset();
  });
  percTrain.property("value", state.percTrainData);
  d3.select("label[for='percTrainData'] .value").text(state.percTrainData);

  // Configure the level of noise.
  const noise = d3.select("#noise").on("input", function () {
    const element = this as HTMLInputElement;
    state.noise = +element.value;
    d3.select("label[for='noise'] .value").text(element.value);
    generateData();
    reset();
  });
  const currentMax = parseInt(noise.property("max"));
  if (state.noise > currentMax) {
    if (state.noise <= 80) noise.property("max", state.noise);
    else state.noise = 50;
  } else if (state.noise < 0) state.noise = 0;
  noise.property("value", state.noise);
  d3.select("label[for='noise'] .value").text(state.noise);

  /* Color map */
  // Add scale to the gradient color map.
  const x = d3.scaleLinear().domain([-1, 1]).range([0, 144]);
  const xAxis = d3
    .axisBottom(x)
    .tickValues([-1, 0, 1])
    .tickFormat(d3.format("d"));
  d3.select("#colormap g.core")
    .append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0,10)")
    .call(xAxis);
}

function updateDecisionBoundary(): void {
  //let treeIdx: number;
  let i: number;
  let j: number;

  const xScale = d3
    .scaleLinear()
    .domain([0, DENSITY - 1])
    .range(xDomain);
  const yScale = d3
    .scaleLinear()
    .domain([DENSITY - 1, 0])
    .range(xDomain);

  mainBoundary = new Array(DENSITY);
  for (i = 0; i < DENSITY; i++) {
    mainBoundary[i] = new Array(DENSITY);
    for (j = 0; j < DENSITY; j++) {
      const x = xScale(i);
      const y = yScale(j);
      const prediction = outputScale(model.predict([[x, y]]));
      // Adds predictions to boundaries.
      mainBoundary[i][j] = prediction;
    }
  }
}

/**
 * Update all heat maps and metrics.
 * @param reset True when called in reset()
 */
function updateUI(reset = false) {
  if (!reset) updateDecisionBoundary();
  // mainHeatMap.updateBackground(mainBoundary, state.discretize);
  outputHeatMap.updateBackground(mainBoundary, state.discretize);

  // Metrics table
  d3.selectAll(".metrics tbody tr").remove();
  metricList.forEach((metric) => {
    const row = d3.select(".metrics tbody").append("tr");
    // First row contains metric name
    row
      .append("td")
      .attr("class", "mdl-data-table__cell--non-numeric")
      .text(metric);
    // Next 2 rows contain train and test metric values
    row
      .append("td")
      .text(trainMetrics ? trainMetrics[metric].toFixed(3) : "0.000");
    row
      .append("td")
      .text(testMetrics ? testMetrics[metric].toFixed(3) : "0.000");
  });
}

/**
 * Reset the app to initial state.
 * @param reset True when called on startup.
 */

function reset(onStartup = false) {
  if (!onStartup) {
    trainWorker.terminate();
    isLoading(false);
  }
  console.log(kernel);
  if (kernel === "POLYNOMIAL") {
    trainWorker = new Worker();
    options = {
      kernel: SVM.KERNEL_TYPES.POLYNOMIAL,
      type: SVM.SVM_TYPES.C_SVC,
      gamma: state.gamma,
      cost: state.parameterC,
      degree: state.polyDegree,
    };
  } else if (kernel === "RBF") {
    trainWorker = new Worker();
    options = {
      kernel: SVM.KERNEL_TYPES.RBF,
      type: SVM.SVM_TYPES.C_SVC,
      gamma: state.gamma,
      cost: state.parameterC,
    };
  } else {
    trainWorker = new Worker();
    options = {
      kernel: SVM.KERNEL_TYPES.LINEAR,
      type: SVM.SVM_TYPES.C_SVC,
      cost: state.parameterC,
    };
  }

  /*   trainWorker = new Worker();
  options = {
    kernel: krn,
    type: SVM.SVM_TYPES.C_SVC,
    gamma: state.gamma,
    cost: state.parameterC,
  }; */
  if (isClassification()) {
    metricList = ["Accuracy", "Precision", "Recall"];
    getMetrics = Utils.getClfMetrics;
  }

  trainMetrics = null;
  testMetrics = null;

  model = null;
  d3.select("#start-button .value").text(
    isClassification() ? "classify" : "Error"
  );

  mainBoundary = new Array(DENSITY);
  for (let i = 0; i < DENSITY; i++) {
    mainBoundary[i] = new Array(DENSITY);
  }

  uploadedData = uploadedData || [];
  data.forEach((d) => {
    delete d.voteCounts;
  });
  [trainData, testData] = splitTrainTest(data);

  state.serialize();
  updatePoints();
  updateUI(true);
}

function drawDatasetThumbnails() {
  const renderThumbnail = (canvas, dataGenerator: DataGenerator) => {
    const w = 100;
    const h = 100;
    canvas.setAttribute("width", w);
    canvas.setAttribute("height", h);
    const context = canvas.getContext("2d");
    const data = dataGenerator(200, 0);
    data.forEach((d: Example2D) => {
      context.fillStyle = colorScale(d.label);
      context.fillRect((w * (d.x + 6)) / 12, (h * (-d.y + 6)) / 12, 4, 4);
    });
    d3.select(canvas.parentNode).style("display", null);
  };
  d3.selectAll(".dataset").style("display", "none");

  if (isClassification()) {
    for (const dataset in datasets) {
      const canvas: any = document.querySelector(
        `canvas[data-dataset=${dataset}]`
      );
      const dataGenerator = datasets[dataset];
      renderThumbnail(canvas, dataGenerator);
    }
  } else {
  }
}

function generateData(firstTime = false) {
  if (!firstTime) {
    // Change the seed.
    state.seed = Math.random().toFixed(5);
    state.serialize();
  }

  Math.seedrandom(state.seed);

  const numSamples = isClassification()
    ? NUM_SAMPLES_CLASSIFY
    : NUM_SAMPLES_REGRESS;
  const generator = isClassification() ? state.dataset : state.regDataset;

  data = generator(numSamples, state.noise / 100);
  // Shuffle the data in-place.
  shuffle(data);
  [trainData, testData] = splitTrainTest(data);
  updatePoints();
}

/**
 * Split the input array into 2 chunks by an index determined by the selected
 * percentage of train data.
 * @param arr
 */
function splitTrainTest(arr: any[]): any[][] {
  const splitIndex = Math.floor((arr.length * state.percTrainData) / 100);
  return [arr.slice(0, splitIndex), arr.slice(splitIndex)];
}

/**
 * Redraw data points on the main heat map.
 */
function updatePoints() {
  mainHeatMap.updatePoints(trainData);
  outputHeatMap.updatePoints(trainData);
  outputHeatMap.updateTestPoints(state.showTestData ? testData : []);
}

/**
 * Shows busy indicators in the UI as something is running in the background.
 * They include making all heatmaps opaque and showing a progress indicator next
 * to the cursor.
 * @param {boolean} loading True if something is running in the background
 */
function isLoading(loading: boolean) {
  d3.select("#output-heatmap").style("opacity", loading ? 0.2 : 1);
  d3.select("#output-heatMap").style("opacity", loading ? 0.2 : 1);
  d3.selectAll("*").style("cursor", loading ? "progress" : null);
}

function isClassification() {
  return state.problem === Problem.CLASSIFICATION;
}
/* function kernelType() {
  const activation = d3.select("#activations").on("change", function () {
    console.log(activation);
    const element = this as HTMLInputElement;
    state.activation = +element.value;
    d3.select("label[for='activations'].value").text(element.value);
    const krnType = element.value.toUpperCase();
    console.log(krnType);
    if (element.value.toUpperCase() === "LINEAR") {
      (document.getElementById("gamma") as HTMLInputElement).disabled = true;
      (document.getElementById("polyDegree") as HTMLInputElement).disabled =
        true;
    } else if (element.value.toUpperCase() === "RBF") {
      (document.getElementById("gamma") as HTMLInputElement).disabled = false;
      (document.getElementById("polyDegree") as HTMLInputElement).disabled =
        true;
    } else {
      (document.getElementById("gamma") as HTMLInputElement).disabled = false;
      (document.getElementById("polyDegree") as HTMLInputElement).disabled =
        false;
    }
    return krnType;
    reset();
  });
} */

drawDatasetThumbnails();
makeGUI();
generateData(true);
reset(true);
