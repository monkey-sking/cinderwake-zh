import { default as dom, Node, Element } from "./tests/fake-dom-tree.js";

console.log("Fake DOM Node textContent desc:", Object.getOwnPropertyDescriptor(Node.prototype, "textContent"));
