// presto-signals.js — Reactive signal system for PRESTO components
// ~3KB minified. No dependencies. No virtual DOM. Surgical DOM updates.
// Used inside htx:script blocks where `el` is the component root.

(function(global) {
  "use strict";

  // --- Dependency Tracking ---
  var trackingStack = [];

  function getCurrentTracker() {
    return trackingStack.length > 0 ? trackingStack[trackingStack.length - 1] : null;
  }

  // --- Batching ---
  var batchDepth = 0;
  var batchQueue = new Set();

  function batch(fn) {
    batchDepth++;
    try {
      fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        var pending = Array.from(batchQueue);
        batchQueue.clear();
        for (var i = 0; i < pending.length; i++) {
          pending[i]._run();
        }
      }
    }
  }

  // --- Signal ---
  function signal(initial) {
    var _value = initial;
    var subscribers = new Set();

    var s = {
      get value() {
        var tracker = getCurrentTracker();
        if (tracker) {
          subscribers.add(tracker);
          tracker._deps.add(s);
        }
        return _value;
      },
      set value(v) {
        if (v === _value) return;
        _value = v;
        var subs = Array.from(subscribers);
        for (var i = 0; i < subs.length; i++) {
          if (batchDepth > 0) {
            batchQueue.add(subs[i]);
          } else {
            subs[i]._run();
          }
        }
      },
      peek: function() { return _value; },
      _subscribers: subscribers
    };

    return s;
  }

  // --- Computed ---
  function computed(fn) {
    var s = signal(undefined);
    var tracker = {
      _deps: new Set(),
      _run: function() {
        // Unsubscribe from old deps
        tracker._deps.forEach(function(dep) {
          dep._subscribers.delete(tracker);
        });
        tracker._deps.clear();
        // Re-evaluate
        trackingStack.push(tracker);
        try {
          s.value = fn();
        } finally {
          trackingStack.pop();
        }
      }
    };
    // Initial evaluation
    tracker._run();

    return {
      get value() {
        // Forward tracking to the inner signal
        var outer = getCurrentTracker();
        if (outer) {
          s._subscribers.add(outer);
          outer._deps.add(s);
        }
        return s.peek();
      },
      peek: function() { return s.peek(); },
      _subscribers: s._subscribers
    };
  }

  // --- Effect ---
  function effect(fn) {
    var tracker = {
      _deps: new Set(),
      _run: function() {
        // Unsubscribe from old deps
        tracker._deps.forEach(function(dep) {
          dep._subscribers.delete(tracker);
        });
        tracker._deps.clear();
        // Re-run
        trackingStack.push(tracker);
        try {
          fn();
        } finally {
          trackingStack.pop();
        }
      },
      dispose: function() {
        tracker._deps.forEach(function(dep) {
          dep._subscribers.delete(tracker);
        });
        tracker._deps.clear();
      }
    };
    // Initial run
    tracker._run();
    return tracker;
  }

  // --- DOM Bindings ---

  // Bind a signal to a DOM node's textContent
  function bind(node, sig) {
    if (!node) return;
    return effect(function() {
      node.textContent = sig.value;
    });
  }

  // Bind a computed function to a DOM attribute
  function bindAttr(node, attr, fn) {
    if (!node) return;
    return effect(function() {
      var val = fn();
      if (attr === "class") {
        node.className = val;
      } else if (attr === "style") {
        node.style.cssText = val;
      } else if (attr === "value") {
        node.value = val;
      } else if (attr === "checked") {
        node.checked = !!val;
      } else if (attr === "disabled") {
        node.disabled = !!val;
      } else if (attr === "hidden") {
        node.hidden = !!val;
      } else {
        node.setAttribute(attr, val);
      }
    });
  }

  // Bind a signal to innerHTML (use with caution — only for trusted content)
  function bindHtml(node, sig) {
    if (!node) return;
    return effect(function() {
      node.innerHTML = sig.value;
    });
  }

  // --- Channel Utility ---
  function channel(url, token) {
    var fullUrl = url + (url.indexOf("?") === -1 ? "?" : "&") + "token=" + token;
    var ws = new WebSocket(fullUrl);
    var handlers = {};
    var readyQueue = [];
    var isOpen = false;

    ws.onopen = function() {
      isOpen = true;
      for (var i = 0; i < readyQueue.length; i++) {
        ws.send(readyQueue[i]);
      }
      readyQueue = [];
    };

    ws.onmessage = function(e) {
      try {
        var msg = JSON.parse(e.data);
        var type = msg.type || "message";
        var fns = handlers[type];
        if (fns) {
          for (var i = 0; i < fns.length; i++) {
            fns[i](msg.data !== undefined ? msg.data : msg);
          }
        }
        // Also fire wildcard handlers
        var wild = handlers["*"];
        if (wild) {
          for (var i = 0; i < wild.length; i++) {
            wild[i](msg);
          }
        }
      } catch (err) {
        // Non-JSON message
        var raw = handlers["raw"];
        if (raw) {
          for (var i = 0; i < raw.length; i++) {
            raw[i](e.data);
          }
        }
      }
    };

    ws.onerror = function(e) {
      var errHandlers = handlers["error"];
      if (errHandlers) {
        for (var i = 0; i < errHandlers.length; i++) {
          errHandlers[i](e);
        }
      }
    };

    ws.onclose = function(e) {
      isOpen = false;
      var closeHandlers = handlers["close"];
      if (closeHandlers) {
        for (var i = 0; i < closeHandlers.length; i++) {
          closeHandlers[i](e);
        }
      }
    };

    return {
      on: function(type, fn) {
        if (!handlers[type]) handlers[type] = [];
        handlers[type].push(fn);
        return this;
      },
      send: function(type, data) {
        var msg = JSON.stringify({ type: type, data: data });
        if (isOpen) {
          ws.send(msg);
        } else {
          readyQueue.push(msg);
        }
        return this;
      },
      close: function() {
        ws.close();
      },
      get readyState() {
        return ws.readyState;
      }
    };
  }

  // --- Exports ---
  global.signal = signal;
  global.computed = computed;
  global.effect = effect;
  global.batch = batch;
  global.bind = bind;
  global.bindAttr = bindAttr;
  global.bindHtml = bindHtml;
  global.channel = channel;

})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : this);
