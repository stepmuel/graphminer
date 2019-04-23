//
//  graph.js
//  graphminer
//
//  Created by Stephan Müller on 2015-04-08.
//  Copyright 2015-2019 Stephan Müller. All rights reserved.
//

var demoConfig = {
  dataURL: "data/graph.json",
  preset: "overview"
};

var ignoreHashChange = false;
window.onhashchange = function() {
  if (ignoreHashChange) {
    ignoreHashChange = false;
    return;
  }
  var params = new URLSearchParams(window.location.hash.substring(1));
  var conf = params.has("config") ? JSON.parse(params.get("config")) : demoConfig;
  loadConfig(true, conf);
};

var edgeColors = d3.scale.category10();

// rainbow(15) from R
var rb15 = ["#FF0000", "#FF6600", "#FFCC00", "#CCFF00", "#66FF00", "#00FF00", "#00FF66", "#00FFCC", "#00CCFF", "#0066FF", "#0000FF", "#6600FF", "#CC00FF", "#FF00CC", "#FF0066"];
var clusterColors = function(i) {
  if (!i && i !== 0) return "#000000";
  return rb15[i%15];
};

var defaults = {
  node: {
    filter: "true",
    sort: "n.id",
    label: "n.id",
  },
  edge: {
    active: true,
    filter: "true",
    width: "uScale(v/100)*4",
  },
};

var defaultPresets = {
  all: {
    node: {label: "n.name"}
  },
  overview: {
    node: {label: "n.name", sorter: "clusterPos('contact',  n)"},
    edge: {
      contact: {filter: "v >= top(nNodes * 1.8)"},
      build: {filter: "v >= top(nNodes * 1.8)"},
      farm: {filter: "v >= top(nNodes * 1.8)"},
      chat: {filter: "v >= top(nNodes * 1.8)"},
      chest: {filter: "v >= top(nNodes * 1.8)"}
    }
  }
};

d3.select("#nodeFilter").attr("placeholder", defaults.node.filter);
d3.select("#nodeSorter").attr("placeholder", defaults.node.sort);
d3.select("#nodeLabel").attr("placeholder", defaults.node.label);
d3.select("#edgeFilter").attr("placeholder", defaults.edge.filter);
d3.select("#edgeWidth").attr("placeholder", defaults.edge.width);

var config = {};
var presets = {};

function objWithPath(source, path) {
  var obj = source;
  path.forEach(function(k) {
    if (!obj[k]) obj[k] = {};
    obj = obj[k];
  });
  return obj;
}

var getNodeOption = function(key) {
  var v = objWithPath(config, ["node"])[key];
  if (v === undefined || v.length == 0) v = defaults.node[key];
  return v;
}

var getEdgeOption = function(edgeKey, key) {
  var v = objWithPath(config, ["edge", edgeKey])[key];
  if (v === undefined || v.length == 0) v = defaults.edge[key];
  return v;
}

var preset = function(e) {
  e.blur();
  if (activeEdgeOptions === null) return;
  if (e.id == "edge-clusterSort") {
    d3.select("#nodeSorter").property("value", "clusterPos('"+activeEdgeOptions+"', n)");
    updateGraph();
  }
  if (e.id == "edge-sumSort") {
    d3.select("#nodeSorter").property("value", "-edgeSum('"+activeEdgeOptions+"', n)");
    updateGraph();
  }
  if (e.id == "edge-sumFilter") {
    d3.select("#nodeFilter").property("value", "edgeSum('"+activeEdgeOptions+"', n) != 0");
    updateGraph();
  }
}

var download = function(e) {
  e.blur();
  var filename = document.getElementById("filename").value || "graph";
  var g = document.getElementById("graph");
  var s = new XMLSerializer();
  var xml = s.serializeToString(g);
  downloadData(filename + ".svg", 'data:image/octet-stream,' + encodeURIComponent(xml));
}

var downloadData = function(filename, data) {
  var link = document.createElement('a');
  link.setAttribute('href', data);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

var diameter = 960,
    radius = diameter / 2,
    innerRadius = radius - 120;

var cluster = d3.layout.cluster()
    .size([360, innerRadius])
    .sort(null)
    .value(function(d) { return d.size; });

var bundle = d3.layout.bundle();

var line = d3.svg.line.radial()
    .interpolate("bundle")
    .tension(.85)
    .radius(function(d) { return d.y; })
    .angle(function(d) { return d.x / 180 * Math.PI; });

var svg = d3.select("#graph")
    .attr("width", diameter)
    // .attr("height", diameter)
    .attr("viewBox", "0 0 "+diameter+" "+diameter)
  .append("g")
    .attr("transform", "translate(" + radius + "," + radius + ")");

var graphData = null;
var nodeMap = {}; // Maps nodes to their DOM element

var allEdgeKeys = [];
var nodeList = []; // Keys of nodes to include in graph, ordered
var edgeWeightsSorted = {};

var inputElement = document.getElementById("input");
inputElement.accept = ".json";
inputElement.addEventListener("change", handleFiles, false);
function handleFiles() {
  var file = inputElement.files[0];
  if (file.type != "application/json") return;
  var reader = new FileReader();
  reader.onloadend = function () {
    var data = JSON.parse(reader.result);
    delete config.dataURL
    loadConfig(false);
    setGraphData(data);
    updateGraph();
    document.getElementById("input-name").innerHTML = file.name;
    inputElement.value = ''; // trigger change when re-adding same file
  }
  reader.readAsBinaryString(file);
}

var setGraphData = function(data) {
  // Static preprocessing
  graphData = data;
  allEdgeKeys = [];
  edgeWeightsSorted = {};
  for (var key in data.edge) {
    allEdgeKeys.push(key);
    var values = [];
    for (var n1 in data.edge[key]) {
      for (var n2 in data.edge[key][n1]) {
        var value = data.edge[key][n1][n2];
        values.push(value);
      }
    }
    values.sort(function(a, b) {return b - a;});
    edgeWeightsSorted[key] = values;
  }
  
  // Add edge list to UI
  var edgeListNode = d3.select("#edgeList");
  edgeListNode.selectAll("*").remove();
  allEdgeKeys.forEach(function(edgeKey, i) {
    var color = edgeColors(i);
    var edgeItem = edgeListNode.append("div").attr("class", "checkbox");
    var label = edgeItem.append("label").style("margin", "1px");
    label.append("input")
      .attr("type", "checkbox")
      .attr("checked", true)
      .attr("id", "edgeSel-"+edgeKey)
      .attr("onChange", "updateGraph()");
    label.append("span")
      .attr("style", "background: " + color + ";")
      .attr("class", "badge badge-pill badge-primary")
      .text(edgeKey);
    // label.append("span").text(edgeKey);
    edgeItem.append("input")
      .attr("class", "btn btn-default pull-right btn-xs")
      .attr("type", "button")
      .attr("onClick", "showEdgeOptions('"+edgeKey+"', this)")
      .attr("id", "edgeOptionButton-"+edgeKey)
      .attr("value", "options");
  });
  
  // Add presets to UI
  presets = data.preset || {};
  var presetListNode = d3.select("#presetList");
  presetListNode.selectAll("*").remove();
  for (var key in defaultPresets) {
    presetListNode.append("li")
        .attr("role", "presentation")
      .append("a")
        .attr("role", "menuitem")
        .attr("href", "javascript:loadPreset('" + key + "')")
        .text(key)
  };
  presetListNode.append("li")
      .attr("role", "presentation")
      .attr("class", "divider");
  for (var key in presets) {
    presetListNode.append("li")
        .attr("role", "presentation")
      .append("a")
        .attr("role", "menuitem")
        .attr("href", "javascript:loadPreset('" + key + "')")
        .text(key)
  };
}

var activeEdgeOptions = null;
var showEdgeOptions = function(edgeKey, e) {
  e.blur();
  d3.select("#edgeOptionButton-"+activeEdgeOptions).classed("active", false);
  var panel = d3.select("#edgeOptionPanel");
  if (activeEdgeOptions == edgeKey) {
    panel.style("display", "none");
    activeEdgeOptions = null;
  } else {
    d3.select("#edgeOptionButton-"+edgeKey).classed("active", true);
    panel.style("display", "block");
    activeEdgeOptions = edgeKey;
    // Set options
    loadConfig(false);
  }
};

var updateConfig = function() {
  var getConfigValue = function(id) {
    var v = d3.select("#" + id).property("value");
    return (v.length == 0) ? undefined : v;
  };
  // Node options
  var nodeConf = objWithPath(config, ["node"]);
  nodeConf.filter = getConfigValue("nodeFilter");
  nodeConf.sorter = getConfigValue("nodeSorter");
  nodeConf.label = getConfigValue("nodeLabel");
  // Edge options
  if (activeEdgeOptions !== null) {
    var edgeConf = objWithPath(config, ["edge", activeEdgeOptions]);
    edgeConf.filter = getConfigValue("edgeFilter");
    edgeConf.width = getConfigValue("edgeWidth");
  }
  // Edge selection
  allEdgeKeys.forEach(function(edgeKey) {
    var checkBox = document.getElementById("edgeSel-" + edgeKey);
    objWithPath(config, ["edge", edgeKey]).active = checkBox.checked;
  });
  // Update config panel json
  var configString = JSON.stringify(config);
  d3.select("#config").property("value", configString);
  ignoreHashChange = true;
  // Update hash (URLSearchParams escapes too many characters, subjectively)
  // var params = new URLSearchParams(window.location.hash);
  // params.set("config", configString);
  // window.location.hash = params.toString();
  window.location.hash = "config=" + configString;
};

var loadConfig = function(doUpdate, newConfig) {
  if (newConfig === undefined) newConfig = config;
  if (!newConfig) newConfig = {};
  if (newConfig.dataURL && config.dataURL !== newConfig.dataURL) {
    d3.json(newConfig.dataURL, function(error, data) {
      if (error) return console.warn(error);
      config.dataURL = newConfig.dataURL;
      setGraphData(data);
      loadConfig(false, newConfig);
      updateGraph();
      document.getElementById("input-name").innerHTML = config.dataURL;
    });
    return;
  }
  if (newConfig.preset) {
    var key = newConfig.preset;
    var preset = defaultPresets[key] || presets[key];
    newConfig = Object.assign({dataURL: undefined}, preset, newConfig);
    delete newConfig.preset;
    if (config.dataURL && !newConfig.dataURL) {
      newConfig.dataURL = config.dataURL;
    }
    loadConfig(doUpdate, newConfig);
    return;
  }
  config = newConfig;
  var setConfigValue = function(id, value) {
    var v = value === undefined ? '' : value;
    d3.select("#" + id).property("value", v);
  };
  var nodeConf = objWithPath(config, ["node"]);
  setConfigValue("nodeFilter", nodeConf.filter);
  setConfigValue("nodeSorter", nodeConf.sorter);
  setConfigValue("nodeLabel", nodeConf.label);
  allEdgeKeys.forEach(function(edgeKey) {
    var checkBox = document.getElementById("edgeSel-"+edgeKey);
    checkBox.checked = getEdgeOption(edgeKey, "active");
  });
  if (activeEdgeOptions !== null) {
    var edgeConf = objWithPath(config, ["edge", activeEdgeOptions]);
    setConfigValue("edgeFilter", edgeConf.filter);
    setConfigValue("edgeWidth", edgeConf.width);
  }
  if (doUpdate) updateGraph();
  d3.select("#config").property("value", JSON.stringify(config));
}

var loadPreset = function(key) {
  loadConfig(true, {preset: key});
}

var updateGraph = function() {
  if (!graphData) return;
  nodeList = [];
  var nodes = graphData.node;
  updateConfig();
  
  // Filter edges
  var edgesFiltered = {};
  allEdgeKeys.forEach(function(key) {
    var edges = graphData.edge[key];
    
    // Helpers
    var nNodes = Object.keys(nodes).length;
    var nEdges = Object.keys(edgeWeightsSorted[key]).length;
    var top = function(eLimit) {
      eLimit = Math.ceil(eLimit);
      var values = edgeWeightsSorted[key];
      if (values.length <= eLimit) return -Infinity;
      return values[eLimit];
    };
    
    var edgeFilterStr = getEdgeOption(key, "filter");
    var func = eval("(function(v){return "+edgeFilterStr+";})");
    edgesFiltered[key] = edgeFilter(edges, func);
    // edgesFiltered[key] = edgeFilterKCore(edgeFilter(edges, func), 5);
  });
  
  // Helper functions
  var clusterCache = {};
  var clusterPos = function(edgeKey, n) {
    var order = clusterCache[edgeKey];
    if (order === undefined) {
      order = clusterSort(nodeList, edgesFiltered[edgeKey]);
      clusterCache[edgeKey] = order;
    }
    var pos = order.indexOf(n.id.toString());
    return pos;
  };
  var edgeSum = function(edgeKey, n) {
    var edges = edgesFiltered[edgeKey];
    if (edges === undefined) return 0;
    var weight = edges[n.id];
    if (weight === undefined) return 0;
    var sum = 0;
    for (var n2 in weight) sum += weight[n2];
    return sum;
  };
  var edgeCount = function(edgeKey, n) {
    var edges = edgesFiltered[edgeKey];
    if (edges === undefined) return 0;
    var weight = edges[n.id];
    if (weight === undefined) return 0;
    return Object.keys(weight).length;
  };
  var uScale = function(v) {
    return 1-(1/(v+1));
  };
  
  // Filter nodes
  var nodeFilter = getNodeOption("filter");
  var filter = eval("(function(n){return "+nodeFilter+";})");
  for (var id in nodes) {
    var node = nodes[id];
    if (!filter(node)) continue;
    nodeList.push(id);
  }
  
  // Sort nodes
  var nodeSorter = getNodeOption("sorter");
  var v = eval("(function(n){return "+nodeSorter+";})");
  var cmp = "v1 = v(nodes[id1]); v2 = v(nodes[id2]); ";
  cmp = cmp + "return typeof v1 === \"string\" ? v1.localeCompare(v2) : v1 - v2;";
  var sorter = eval("(function(id1, id2){"+cmp+"})");
  nodeList.sort(sorter);
  
  cluster.separation(function (a,b) {return nodes[a.id].group==nodes[b.id].group ? 1 : 2});
  
  // Create nodes from cluster layout
  var clusterNodes = cluster.nodes(nodeHierarchy(nodeList));
  // Create DOM node map
  nodeMap = {};
  clusterNodes.forEach(function(d) {
    nodeMap[d.id] = d;
  });
  // Draw nodes
  var nodeLabelFuncStr = getNodeOption("label");
  var nodeLabel = eval("(function(n){return "+nodeLabelFuncStr+";})");
  svg.selectAll(".node").remove();
  var nodeGroup = svg.selectAll(".node")
      .data(clusterNodes.filter(function(n) { return !n.children; }))
    .enter().append("g")
      .attr("class", "node")
      .attr("transform", function(d) { return "rotate(" + (d.x - 90) + ")translate(" + d.y + ")"; });
  var labelOffset = 8;
  if (nodeLabelFuncStr === "null") {
    // TODO: allow choosing a color
    labelOffset += 12;
    nodeGroup.append("circle")
      .attr("cx", 12)
      .attr("cy", 0)
      .attr("r", 4)
      .attr("fill", "#FFF")
      .attr("stroke", function (d) {return clusterColors(nodes[d.id].group);})
      .attr("stroke-width", 1);
  }
  nodeGroup.append("text")
    .attr("dx", function(d) { return d.x < 180 ? labelOffset : -labelOffset; })
    .attr("dy", ".31em")
    .attr("text-anchor", function(d) { return d.x < 180 ? "start" : "end"; })
    .attr("transform", function(d) { return d.x < 180 ? null : "rotate(180)"; })
    .text(function (d) {return d.parent===null ? "root" : nodeLabel(nodes[d.id]);});
  // Draw edges
  svg.selectAll(".link").remove();
  var nr = -1;
  allEdgeKeys.forEach(function(key) {
    nr += 1;
    if (!getEdgeOption(key, "active")) return;
    var widthFuncStr = getEdgeOption(key, "width");
    var width = eval("(function(v){return "+widthFuncStr+";})");
    var c = edgeColors(nr);
    var edges = edgesFiltered[key];
    var edgeBundle = bundle(edgeList(edges));
    svg.selectAll(".emptysel")
        .data(edgeBundle)
      .enter().append("path")
        .attr("class", "link")
        .attr("stroke", c)
        .attr("d", line)
        .attr("stroke-width", function(d) {
          var weight = edges[d[0].id][d[2].id];
          return width(weight);
        });
  });
}  

d3.select(self.frameElement).style("height", diameter + "px");

// Attaches nodes to a root node (d3 format)
function nodeHierarchy(nodes) {
  var children = [];
  nodes.forEach(function(n) {
    children.push({id: n, children: []});
  });
  return {parent: null, id: "root", children: children};
}

// List of edges between DOM nodes (d3 format)
function edgeList(edges) {
  var list = [];
  for (var id1 in edges) {
    var source = nodeMap[id1];
    if (source === undefined) continue;
    for (var id2 in edges[id1]) {
      var target = nodeMap[id2];
      if (target === undefined) continue;
      list.push({source: source, target: target});
    }
  }
  return list;
}

function edgeFilter(edges, func) {
  var out = {};
  for (var n1 in edges) {
    var filtered = {};
    var count = 0;
    for (var n2 in edges[n1]) {
      var weight = edges[n1][n2];
      if (!func(weight, n1, n2)) continue;
      filtered[n2] = weight;
      count += 1;
    }
    if (count == 0) continue;
    out[n1] = filtered;
  }
  return out;
}

function edgeFilterKCore(edges, k) {
  var stable = false;
  while (!stable) {
    stable = true;
    var out = {};
    for (var n1 in edges) {
      var filtered = {};
      var count = 0;
      for (var n2 in edges[n1]) {
        if (edges[n2] === undefined) continue;
        filtered[n2] = edges[n1][n2];
        count += 1;
      }
      if (count == 0 || count < k) {
        stable = false;
      } else {
        out[n1] = filtered;
      }
    }
    edges = out;
  }
  return out;
}

function clusterSort(nodes, edges) {
  // This algorithm is iteratively sorting a hierarchical cluster
  
  // Distance between two clusters (negative sum of shared edges)
  // Result is smaller if clusters have many heavy shared edges
  var distance = function(c1, c2) {
    var sum = 0;
    for (var n1 of c1) {
      var weights = edges[n1];
      if (weights === undefined) continue;
      for (var n2 of c2) {
        var v = weights[n2];
        if (v === undefined) continue;
        sum += v;
      }
    }
    return -sum;
  };
  
  // Rate order of nodes (negative sum of edge weight times node distance)
  // Result is bigger if nodes with heavy edges are close to each other
  var rate = function(order) {
    var pos = {};
    order.forEach(function(n, p) {
      pos[n] = p;
    });
    var sum = 0;
    order.forEach(function(n1, p1) {
      var weights = edges[n1];
      if (weights === undefined) return;
      for (var n2 in weights) {
        var p2 = pos[n2];
        if (p2 === undefined) continue;
        var d = Math.abs(p2 - p1);
        sum += d * weights[n2];
      }
    });
    return -sum;
  };
  
  // Combine two clusters in a way that optimizes the rating of the node order
  var combine = function(clusters, p1, p2) {
    var cluster1 = clusters[p1];
    var cluster2 = clusters[p2];
    var cluster2r = cluster2.slice().reverse();
    // Construct 4 possible combinations that leave rating within clusters intact
    var orders = [];
    orders.push(cluster1.concat(cluster2));
    orders.push(cluster2.concat(cluster1));
    orders.push(cluster1.concat(cluster2r));
    orders.push(cluster2r.concat(cluster1));
    // Find best combination
    // NOTE: It would be enough to just rate the edges connecting the clusters
    var ratings = orders.map(rate);
    var maxKey = ratings.indexOf(Math.max.apply(Math, ratings));
    // Replace old clusters with best combination
    clusters[p1] = orders[maxKey];
    clusters.splice(p2, 1);
  }
  
  // Create cluster of unrelated nodes for performance
  // Other clusters contain a single node
  var noEdge = [];
  var clusters = [];
  nodes.forEach(function(n) {
    var weight = edges[n];
    if (weight === undefined || weight.length == 0) {
      noEdge.push(n);
    } else {
      clusters.push([n]);
    }
  });
  if (noEdge.length > 0) {
    clusters.push(noEdge);
  }
  
  // Combine clusters until there is only one remaining
  while (clusters.length > 1) {
    // Find cluster pair with minimal distance and combine them
    // NOTE: Could use priority queue of cluster pairs [c1, c2, dist]
    var minDist = Infinity;
    var minInd = null;
    for (var i = 0; i < clusters.length - 1; i++) {
      for (var j = i + 1; j < clusters.length; j++) {
        var dist = distance(clusters[i], clusters[j]);
        if (dist >= minDist) continue;
        minDist = dist;
        minInd = [i, j];
      };
    };
    combine(clusters, minInd[0], minInd[1]);
  }
  
  return clusters[0];
}

function relFilter(rel, func) {
  var out = {};
  for (var k1 in rel) {
    var filtered = {};
    var k1rel = rel[k1];
    var n = 0;
    for (var k2 in k1rel) {
      var v = k1rel[k2];
      if (!func(v)) continue;
      filtered[k2] = v;
      n += 1;
    }
    if (n == 0) continue;
    out[k1] = filtered;
  }
  return out;
}
