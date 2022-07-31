import SVM from "libsvm-js/asm.js";
const wrk: Worker = self as any;
let svm;
wrk.onmessage = function (msg: MessageEvent) {
  const { options, trainingSet, labels } = msg.data;
  svm = new SVM(options);
  svm.train(trainingSet, labels);
  let model = svm.serializeModel();
  postMessage(model);
};
