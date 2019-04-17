GraphMiner enables interactive exploration of player weighted graphs. Several graphs can be visualized at once. The nodes (vertices) can be filtered and sorted using JavaScript expressions. Edges can be filtered and their width set by custom JavaScript expressions also.

GraphMiner was developed as part of the [HeapCraft project](https://heapcraft.net/). The project site features an [interactive demo](https://heapcraft.net/graphminer/) of GraphMiner with Minecraft player data.

![GraphMiner Screenshot](https://heapcraft.net/graphminer/screenshot.png)

# Graph Data Format

Graphs are defined using JSON. The root object contains a list of nodes by id. The node objects can contain arbitrary data. Edges grouped using a *group name*. Edges are then defined using `rootObj.edge[groupName][srcId][dstId] = weight`.

Graph objects can be opened using **Select file**, or using the `dataURL` config property (described later). The example below represents two nodes (players) who have had contact for 128 seconds.

```js
{
  // Configuration presets by name (optional)
  "preset": {
    "preset1": {...}
  },
  // Node objects by id
  "node": {
    "1": {
      "id": 1,
      "name": "steve"
    },
    "2": {
      "id": 2,
      "name": "alex"
    }
  },
  // Edges by edge group name
  "edge": {
    "contact": {
      "1": {
        "2": 128
      },
      "2": {
        "1": 128
      }
    }
  }
}
```

# Usage

The visualization of the graph can configured using JavaScript expressions. They must return the correct type when evaluated.

## Nodes

Available symbols:

* `n` (`object`)
  * The object representing the node.
* `edgeCount(groupName, n)` (`function`)
  * Returns the number of outgoing edges from node `n`.
  * *Example:* If a node has no contact edges, `edgeCount('contact', n)` is `0`.
* `edgeSum(groupName, n)` (`function`)
  * Returns the sum of weights of all outgoing edges from node `n`.
  * *Example:* in the graph above, `edgeSum('contact', n)` is `128`.
* `clusterPos(groupName, n)` (`function`)
  * Returns the array index if node `n` when sorted with our *cluster sort algorithm*
  * The algorithm tries to position nodes with common edges close by minimizing the sum of `distance * weight` for all node pairs.

Configuration expressions:

* **Filter** (`boolean`, default: `true`)
  * Node `n` is only included if this expression evaluates to `true`.
* **Sort** (`string | number`, default: `n.id`)
  * Nodes are sorted by the result of expression (can be string or number)
* **Label** (`string`, default: `n.id`)
  * Label text to display next to the node.
  * When value is `null`, a black circle will be used.

Edge filters are evaluated before the node expressions, so `edgeSum` and `clusterPos` will use the filtered edges.

## Edges

Use the checkbox to show or hide edge groups. Additional configurations are available using the *options* button.

Available symbols:

* `v` (`number`)
  * Current edge weight value.
* `nNodes` (`number`)
  * Total number of nodes (unfiltered).
* `nEdges` (`number`)
  * Total number of edges of current group (unfiltered).
* `top(limit)` (`function`)
  * Returns an edge weight value where `limit` edges are bigger as.
  * A filter of `v >= top(4)` will only show the biggest two edge pairs.
* `uScale(v)` (`function`)
   * returns `1-(1/(v+1))`.
   * Can be used to normalize edge widths.

Configuration expressions:

* **Filter** (`boolean`, default: `true`)
  * Edge is only included if this expression evaluates to `true`.
* **Width** (`number`, default: `uScale(v/100)*4`)
  * Width of the edge (in points)

The edge options panel features buttons to set node parameters according to edge properties:

* **sumFilter** 
  * Puts `edgeSum('groupName', n) != 0` into the node filter field.
  * This hides all nodes with no outgoing edges.
* **sumFilter**
  * Puts `-edgeSum('*edgeGroup*', n)` into the node sort field
  * This sorts nodes by the sum of their outgoing edges.
* **clusterSort**
  * Puts `clusterPos('*edgeGroup*', n)` into the node sort field
  * This sorts nodes using hierarchical clustering.

## Config

The configuration object contains all current options. It can copied and stored elsewhere, and then used to restore a configuration later. The configuration object is also present in the URL, so configuration can be included in a link.

Configuration objects can be included in the graph data. They will appear in the **Preset** menu.

In addition to the configuration properties set by the UI, the following are supported also:

* `dataURL` (`string`)
  * URL to fetch graph data from.
  * This property will persist when loading a new preset, but is deleted when opening a graph file.
* `preset` (`string`)
  * Name of a preset to load.

# Example Data

Two graph data files are included in this repo: `data/graph.json` and `data/graph2.json`. They are both created from analyzing players on a Minecraft server.

The following properties are available for player nodes:

* `id` [string]
  * Node id.
* `name` [string]
  * Player name.
* `tLastEvent` [epoch]
  * Time of last recorded event.
* `tActive` [seconds]
  * Active gameplay.
* `tSocial` [seconds*nPlayers]
  * Active near other players.
* `nBlockBreak` [blocks]
  * Number of blocks broke
* `nBlockPlace` [blocks]
  * Number of blocks placed.
* `sMove` [blocks]
  * Distance moved.

The following edge groups are available:

* `contact` [seconds]
  * Duration of players being active near each other.
* `build` [blocks]
  * Players contributing to same structure.
* `farm` [blocks]
  * Players using same farm.
* `chat` [times]
  * Players using in game chat to at the same time.
* `chest` [items]
  * Players using the same chest.

More information about those metrics can be found in our [papers](https://heapcraft.net/?p=research).
