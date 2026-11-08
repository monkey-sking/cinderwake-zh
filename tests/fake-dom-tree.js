/**
 * 轻量级假 DOM 树实现，专为 Cinderwake 汉化脚本的文本替换、DOM 遍历与监听测试而设计。
 *
 * 特性：
 *   - Node 类型常量与类层次：Node.ELEMENT_NODE (1), Node.TEXT_NODE (3), Node.DOCUMENT_NODE (9)
 *   - 节点结构：parentNode, childNodes, children, nextSibling, previousSibling, firstChild, lastChild
 *   - 节点属性：id, className, classList (add, remove, contains, toggle), tagName, nodeName,
 *             nodeValue, textContent, style, dataset, title, lang
 *   - DOM 操作：appendChild, insertBefore, removeChild, replaceChild, createElement, createTextNode, cloneNode
 *   - TreeWalker: document.createTreeWalker(root, whatToShow, filter)
 *     支持 NodeFilter.SHOW_ALL, SHOW_ELEMENT, SHOW_TEXT
 *     NodeFilter.FILTER_ACCEPT, FILTER_REJECT, FILTER_SKIP
 *   - MutationObserver: observe(target, options), disconnect(), takeRecords()
 *     支持 childList, subtree, characterData, attributeFilter 等
 *   - document.title 与 document.documentElement.lang
 */

export const NodeTypes = {
  ELEMENT_NODE: 1,
  ATTRIBUTE_NODE: 2,
  TEXT_NODE: 3,
  CDATA_SECTION_NODE: 4,
  ENTITY_REFERENCE_NODE: 5,
  ENTITY_NODE: 6,
  PROCESSING_INSTRUCTION_NODE: 7,
  COMMENT_NODE: 8,
  DOCUMENT_NODE: 9,
  DOCUMENT_TYPE_NODE: 10,
  DOCUMENT_FRAGMENT_NODE: 11,
  NOTATION_NODE: 12
};

export const NodeFilter = {
  SHOW_ALL: 0xFFFFFFFF,
  SHOW_ELEMENT: 0x1,
  SHOW_ATTRIBUTE: 0x2,
  SHOW_TEXT: 0x4,
  SHOW_CDATA_SECTION: 0x8,
  SHOW_ENTITY_REFERENCE: 0x10,
  SHOW_ENTITY: 0x20,
  SHOW_PROCESSING_INSTRUCTION: 0x40,
  SHOW_COMMENT: 0x80,
  SHOW_DOCUMENT: 0x100,
  SHOW_DOCUMENT_TYPE: 0x200,
  SHOW_DOCUMENT_FRAGMENT: 0x400,
  SHOW_NOTATION: 0x800,

  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3
};

class ClassList {
  constructor(element) {
    this._element = element;
  }

  _getClasses() {
    const raw = this._element._className || "";
    return raw.trim().split(/\s+/).filter(Boolean);
  }

  _setClasses(classes) {
    this._element._className = classes.join(" ");
  }

  add(...tokens) {
    const classes = this._getClasses();
    for (const token of tokens) {
      if (token && !classes.includes(token)) {
        classes.push(token);
      }
    }
    this._setClasses(classes);
  }

  remove(...tokens) {
    const removeSet = new Set(tokens);
    const classes = this._getClasses().filter(c => !removeSet.has(c));
    this._setClasses(classes);
  }

  contains(token) {
    return this._getClasses().includes(token);
  }

  toggle(token, force) {
    const exists = this.contains(token);
    const shouldAdd = force !== undefined ? Boolean(force) : !exists;
    if (shouldAdd) {
      this.add(token);
    } else {
      this.remove(token);
    }
    return shouldAdd;
  }

  toString() {
    return this._element._className || "";
  }
}

export class FakeNode {
  constructor(nodeType, nodeName, ownerDocument = null) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx > 0 ? this.parentNode.childNodes[idx - 1] : null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    if (idx !== -1 && idx < this.parentNode.childNodes.length - 1) {
      return this.parentNode.childNodes[idx + 1];
    }
    return null;
  }

  get textContent() {
    let out = "";
    for (const child of this.childNodes) {
      out += child.textContent || "";
    }
    return out;
  }

  set textContent(val) {
    const str = String(val == null ? "" : val);
    const removed = [...this.childNodes];
    for (const child of removed) {
      child.parentNode = null;
    }
    this.childNodes = [];

    let added = [];
    if (str.length > 0) {
      const textNode = new FakeTextNode(str, this.ownerDocument);
      textNode.parentNode = this;
      this.childNodes.push(textNode);
      added = [textNode];
    }

    if (this.ownerDocument && this.ownerDocument._notifyObservers) {
      this.ownerDocument._notifyObservers({
        type: "childList",
        target: this,
        addedNodes: added,
        removedNodes: removed,
        previousSibling: null,
        nextSibling: null
      });
    }
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  insertBefore(child, referenceChild) {
    if (!child || !(child instanceof FakeNode)) {
      throw new TypeError("Failed to execute insertBefore: parameter 1 is not of type FakeNode");
    }

    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }

    child.parentNode = this;
    if (this.ownerDocument) {
      child._setOwnerDocument(this.ownerDocument);
    }

    let insertIndex = this.childNodes.length;
    if (referenceChild) {
      const idx = this.childNodes.indexOf(referenceChild);
      if (idx === -1) {
        throw new Error("Failed to execute insertBefore: reference child is not a child of this node.");
      }
      insertIndex = idx;
    }

    const prevSib = insertIndex > 0 ? this.childNodes[insertIndex - 1] : null;
    const nextSib = referenceChild || null;

    this.childNodes.splice(insertIndex, 0, child);

    if (this.ownerDocument && this.ownerDocument._notifyObservers) {
      this.ownerDocument._notifyObservers({
        type: "childList",
        target: this,
        addedNodes: [child],
        removedNodes: [],
        previousSibling: prevSib,
        nextSibling: nextSib
      });
    }

    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx === -1) {
      throw new Error("Failed to execute removeChild: The node to be removed is not a child of this node.");
    }

    const prevSib = idx > 0 ? this.childNodes[idx - 1] : null;
    const nextSib = idx < this.childNodes.length - 1 ? this.childNodes[idx + 1] : null;

    this.childNodes.splice(idx, 1);
    child.parentNode = null;

    if (this.ownerDocument && this.ownerDocument._notifyObservers) {
      this.ownerDocument._notifyObservers({
        type: "childList",
        target: this,
        addedNodes: [],
        removedNodes: [child],
        previousSibling: prevSib,
        nextSibling: nextSib
      });
    }

    return child;
  }

  replaceChild(newChild, oldChild) {
    if (!oldChild || !newChild) {
      throw new TypeError("Failed to execute replaceChild: both parameters must be provided");
    }
    const idx = this.childNodes.indexOf(oldChild);
    if (idx === -1) {
      throw new Error("Failed to execute replaceChild: The node to be replaced is not a child of this node.");
    }

    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }

    newChild.parentNode = this;
    if (this.ownerDocument) {
      newChild._setOwnerDocument(this.ownerDocument);
    }

    const prevSib = idx > 0 ? this.childNodes[idx - 1] : null;
    const nextSib = idx < this.childNodes.length - 1 ? this.childNodes[idx + 1] : null;

    this.childNodes[idx] = newChild;
    oldChild.parentNode = null;

    if (this.ownerDocument && this.ownerDocument._notifyObservers) {
      this.ownerDocument._notifyObservers({
        type: "childList",
        target: this,
        addedNodes: [newChild],
        removedNodes: [oldChild],
        previousSibling: prevSib,
        nextSibling: nextSib
      });
    }

    return oldChild;
  }

  contains(other) {
    if (!other) return false;
    let curr = other;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }

  _setOwnerDocument(doc) {
    this.ownerDocument = doc;
    for (const child of this.childNodes) {
      child._setOwnerDocument(doc);
    }
  }
}

FakeNode.ELEMENT_NODE = NodeTypes.ELEMENT_NODE;
FakeNode.TEXT_NODE = NodeTypes.TEXT_NODE;
FakeNode.DOCUMENT_NODE = NodeTypes.DOCUMENT_NODE;

export class FakeTextNode extends FakeNode {
  constructor(text = "", ownerDocument = null) {
    super(NodeTypes.TEXT_NODE, "#text", ownerDocument);
    this._value = String(text == null ? "" : text);
  }

  get nodeValue() {
    return this._value;
  }

  set nodeValue(val) {
    const oldVal = this._value;
    this._value = String(val == null ? "" : val);

    if (this.ownerDocument && this.ownerDocument._notifyObservers && oldVal !== this._value) {
      this.ownerDocument._notifyObservers({
        type: "characterData",
        target: this,
        oldValue: oldVal
      });
    }
  }

  get textContent() {
    return this.nodeValue;
  }

  set textContent(val) {
    this.nodeValue = val;
  }
}

export class FakeElement extends FakeNode {
  constructor(tagName, ownerDocument = null) {
    super(NodeTypes.ELEMENT_NODE, tagName.toUpperCase(), ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.id = "";
    this._className = "";
    this.classList = new ClassList(this);
    this.attrs = {};
    this.dataset = {};
    this.style = {};
    this.title = "";
    this.lang = "";
  }

  get className() {
    return this._className;
  }

  set className(val) {
    this._className = String(val || "");
  }

  get children() {
    return this.childNodes.filter(n => n.nodeType === NodeTypes.ELEMENT_NODE);
  }

  getAttribute(name) {
    const key = String(name).toLowerCase();
    if (key === "id") return this.id || null;
    if (key === "class") return this.className || null;
    if (key === "title") return this.title || null;
    if (key === "lang") return this.lang || null;
    return this.attrs[key] !== undefined ? this.attrs[key] : null;
  }

  setAttribute(name, value) {
    const key = String(name).toLowerCase();
    const strVal = String(value);
    if (key === "id") this.id = strVal;
    else if (key === "class") this.className = strVal;
    else if (key === "title") this.title = strVal;
    else if (key === "lang") this.lang = strVal;
    else this.attrs[key] = strVal;
    this.ownerDocument?._notifyObservers({ type: "attributes", target: this, attributeName: key });
  }

  removeAttribute(name) {
    const key = String(name).toLowerCase();
    if (key === "id") this.id = "";
    else if (key === "class") this.className = "";
    else if (key === "title") this.title = "";
    else if (key === "lang") this.lang = "";
    else delete this.attrs[key];
  }

  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }

  matches(selector) {
    return matchSelector(this, selector);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    function walk(node) {
      for (const child of node.childNodes) {
        if (child.nodeType === NodeTypes.ELEMENT_NODE) {
          if (child.matches(selector)) {
            results.push(child);
          }
          walk(child);
        }
      }
    }
    walk(this);
    return results;
  }
}

function matchSelector(el, selector) {
  if (!selector) return false;
  const parts = String(selector).split(",").map(s => s.trim()).filter(Boolean);
  return parts.some(part => {
    if (part.startsWith("#")) {
      return el.id === part.slice(1);
    }
    if (part.startsWith(".")) {
      return el.classList.contains(part.slice(1));
    }
    if (part.startsWith("[")) {
      const match = part.match(/\[([a-zA-Z0-9_-]+)(?:=([^\],]+))?\]/);
      if (match) {
        const attr = match[1];
        const val = match[2] ? match[2].replace(/^["']|["']$/g, "") : undefined;
        if (val === undefined) return el.hasAttribute(attr);
        return el.getAttribute(attr) === val;
      }
    }
    const tagMatch = part.match(/^([a-zA-Z0-9_-]+)(.*)$/);
    if (tagMatch) {
      const tag = tagMatch[1].toUpperCase();
      const rest = tagMatch[2];
      if (el.tagName !== tag) return false;
      if (!rest) return true;
      if (rest.startsWith("#")) return el.id === rest.slice(1);
      if (rest.startsWith(".")) return el.classList.contains(rest.slice(1));
      return false;
    }
    return false;
  });
}

export class FakeTreeWalker {
  constructor(root, whatToShow = NodeFilter.SHOW_ALL, filter = null) {
    this.root = root;
    this.whatToShow = whatToShow;
    this.filter = typeof filter === "function" ? { acceptNode: filter } : (filter || null);
    this.currentNode = root;
  }

  _testNode(node) {
    if (node === this.root) {
      return NodeFilter.FILTER_ACCEPT;
    }

    const typeFlag = 1 << (node.nodeType - 1);
    if ((this.whatToShow & typeFlag) === 0) {
      return NodeFilter.FILTER_SKIP;
    }

    if (this.filter && typeof this.filter.acceptNode === "function") {
      return this.filter.acceptNode(node);
    }

    return NodeFilter.FILTER_ACCEPT;
  }

  nextNode() {
    let node = this.currentNode;
    while (true) {
      let next = null;
      if (node.childNodes && node.childNodes.length > 0) {
        next = node.childNodes[0];
      } else {
        let temp = node;
        while (temp && temp !== this.root) {
          if (temp.nextSibling) {
            next = temp.nextSibling;
            break;
          }
          temp = temp.parentNode;
        }
      }

      if (!next) {
        return null;
      }

      const decision = this._testNode(next);

      if (decision === NodeFilter.FILTER_ACCEPT) {
        this.currentNode = next;
        return next;
      }

      if (decision === NodeFilter.FILTER_SKIP) {
        node = next;
        continue;
      }

      if (decision === NodeFilter.FILTER_REJECT) {
        let temp = next;
        next = null;
        while (temp && temp !== this.root) {
          if (temp.nextSibling) {
            next = temp.nextSibling;
            break;
          }
          temp = temp.parentNode;
        }
        if (!next) return null;
        node = next;
        const subDecision = this._testNode(node);
        if (subDecision === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node;
          return node;
        }
        continue;
      }

      node = next;
    }
  }
}

export class FakeMutationRecord {
  constructor(init = {}) {
    this.type = init.type || "childList";
    this.target = init.target || null;
    this.addedNodes = init.addedNodes || [];
    this.removedNodes = init.removedNodes || [];
    this.previousSibling = init.previousSibling || null;
    this.nextSibling = init.nextSibling || null;
    this.attributeName = init.attributeName || null;
    this.attributeNamespace = init.attributeNamespace || null;
    this.oldValue = init.oldValue !== undefined ? init.oldValue : null;
  }
}

export class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this._targets = new Map();
    this._records = [];
  }

  observe(target, options = {}) {
    if (!target) throw new TypeError("Failed to execute observe on FakeMutationObserver: target is required.");
    this._targets.set(target, {
      childList: Boolean(options.childList),
      subtree: Boolean(options.subtree),
      characterData: Boolean(options.characterData),
      characterDataOldValue: Boolean(options.characterDataOldValue),
      attributes: Boolean(options.attributes),
      attributeFilter: options.attributeFilter
    });

    const doc = target.ownerDocument || (target.nodeType === NodeTypes.DOCUMENT_NODE ? target : null);
    if (doc && doc._registerObserver) {
      doc._registerObserver(this);
    }
  }

  disconnect() {
    for (const [target] of this._targets) {
      const doc = target.ownerDocument || (target.nodeType === NodeTypes.DOCUMENT_NODE ? target : null);
      if (doc && doc._unregisterObserver) {
        doc._unregisterObserver(this);
      }
    }
    this._targets.clear();
    this._records = [];
  }

  takeRecords() {
    const copy = [...this._records];
    this._records = [];
    return copy;
  }

  _onMutation(mutation) {
    let matched = false;

    for (const [target, options] of this._targets) {
      const isDirectTarget = (mutation.target === target);
      const isSubtree = options.subtree && target.contains(mutation.target);

      if (!isDirectTarget && !isSubtree) {
        continue;
      }

      if (mutation.type === "childList" && options.childList) {
        matched = true;
        break;
      }

      if (mutation.type === "characterData" && options.characterData) {
        matched = true;
        break;
      }

      if (mutation.type === "attributes" && options.attributes &&
          (!options.attributeFilter || options.attributeFilter.includes(mutation.attributeName))) {
        matched = true;
        break;
      }
    }

    if (matched) {
      const record = new FakeMutationRecord(mutation);
      this._records.push(record);
      try {
        const records = this.takeRecords();
        if (records.length > 0) {
          this.callback(records, this);
        }
      } catch (err) {
        console.error("MutationObserver callback error:", err);
      }
    }
  }
}

export class FakeDocument extends FakeNode {
  constructor() {
    super(NodeTypes.DOCUMENT_NODE, "#document", null);
    this.ownerDocument = null;
    this._observers = new Set();

    this.documentElement = new FakeElement("html", this);
    this.head = new FakeElement("head", this);
    this.body = new FakeElement("body", this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);

    this._titleElement = new FakeElement("title", this);
    this.head.appendChild(this._titleElement);
  }

  get title() {
    return this._titleElement.textContent;
  }

  set title(val) {
    this._titleElement.textContent = String(val || "");
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text) {
    return new FakeTextNode(text, this);
  }

  createTreeWalker(root, whatToShow = NodeFilter.SHOW_ALL, filter = null) {
    return new FakeTreeWalker(root, whatToShow, filter);
  }

  getElementById(id) {
    const strId = String(id);
    let found = null;
    function walk(node) {
      if (found) return;
      for (const child of node.childNodes) {
        if (child.nodeType === NodeTypes.ELEMENT_NODE) {
          if (child.id === strId) {
            found = child;
            return;
          }
          walk(child);
        }
      }
    }
    walk(this);
    return found;
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  _registerObserver(observer) {
    this._observers.add(observer);
  }

  _unregisterObserver(observer) {
    this._observers.delete(observer);
  }

  _notifyObservers(mutation) {
    for (const observer of Array.from(this._observers)) {
      observer._onMutation(mutation);
    }
  }
}

export function createFakeEnvironment() {
  const document = new FakeDocument();
  const window = {
    document,
    Node: FakeNode,
    NodeFilter,
    MutationObserver: FakeMutationObserver,
    TreeWalker: FakeTreeWalker,
    Element: FakeElement,
    Text: FakeTextNode
  };
  return { document, window, NodeFilter, FakeMutationObserver, FakeDocument, FakeElement, FakeTextNode, FakeNode };
}
