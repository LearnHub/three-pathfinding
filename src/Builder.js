import { Utils } from './Utils';

let polygonId = 1;

class Builder {
  /**
   * Constructs groups from the given navigation mesh.
   * @param  {THREE.Geometry} geometry
   * @return {Zone}
   */
  static buildZone (geometry) {

    const navMesh = this._buildNavigationMesh(geometry);

    const zone = {};

    zone.vertices = navMesh.vertices;

    const groups = this._buildPolygonGroups(navMesh);

    // TODO: This block represents a large portion of navigation mesh construction time
    // and could probably be optimized. For example, construct portals while
    // determining the neighbor graph.
    zone.groups = new Array(groups.length);
    groups.forEach((group, groupIndex) => {

      const indexByPolygonId = {};
      group.forEach((poly, polyIndex) => { indexByPolygonId[poly.id] = polyIndex; });

      const newGroup = new Array(group.length);
      group.forEach((poly, polyIndex) => {

        const neighbourIndices = [];
        poly.neighbours.forEach((n) => neighbourIndices.push(indexByPolygonId[n.id]));

        // Build a portal list to each neighbour
        const portals = [];
        poly.neighbours.forEach((n) => portals.push(this._getSharedVerticesInOrder(poly, n)));

        newGroup[polyIndex] = {
          id: polyIndex,
          neighbours: neighbourIndices,
          vertexIds: poly.vertexIds,
          centroid: poly.centroid,
          portals: portals
        };
      });

      zone.groups[groupIndex] = newGroup;
    });

    return zone;
  }

  /**
   * Constructs a navigation mesh from the given geometry.
   * @param {THREE.Geometry} geometry
   * @return {Object}
   */
  static _buildNavigationMesh (geometry) {
    Utils.computeCentroids(geometry);
    geometry.mergeVertices();
    return this._buildPolygonsFromGeometry(geometry);
  }

  /**
   * Spreads the group ID of the given polygon to all connected polygons
   * @param {Object} polygon 
   */
  static _spreadGroupId (polygon) {
    // Initialize the list of polygons to process with the seed polygon
    var polygonsToProcess = new Set();
    polygonsToProcess.add(polygon);
    while(polygonsToProcess.size > 0) {
      // Copy the nodes that will be processed in this iteration
      const connectedPolygons = polygonsToProcess
      polygonsToProcess = new Set();
      connectedPolygons.forEach(connectedPolygon => {
        // Add the polygon to the group
        connectedPolygon.group = polygon.group;
        // Add any unset neighbours to the list for processing in the next iteration
        connectedPolygon.neighbours.forEach(neighbour => { 
          if(neighbour.group == undefined) {
            polygonsToProcess.add(neighbour);
          }
        });
      });
    }
  }

  static _buildPolygonGroups (navigationMesh) {

    const polygons = navigationMesh.polygons;

    const polygonGroups = [];

    polygons.forEach((polygon) => {
      if (polygon.group !== undefined) {
        // this polygon is already part of a group
        polygonGroups[polygon.group].push(polygon);
      } else {
        // we need to make a new group and spread its ID to neighbors
        polygon.group = polygonGroups.length;
        this._spreadGroupId(polygon);
        polygonGroups.push([polygon]);
      }
    });

    return polygonGroups;
  }

  static _buildPolygonNeighbours (polygon, vertexPolygonMap) {
    const neighbours = new Set();

    const groupA = vertexPolygonMap[polygon.vertexIds[0]];
    const groupB = vertexPolygonMap[polygon.vertexIds[1]];
    const groupC = vertexPolygonMap[polygon.vertexIds[2]];

    // It's only necessary to iterate groups A and B. Polygons contained only
    // in group C cannot share a >1 vertex with this polygon.
    // IMPORTANT: Bublé cannot compile for-of loops.
    groupA.forEach((candidate) => {
      if (candidate === polygon) return;
      if (groupB.includes(candidate) || groupC.includes(candidate)) {
        neighbours.add(candidate);
      }
    });
    groupB.forEach((candidate) => {
      if (candidate === polygon) return;
      if (groupC.includes(candidate)) {
        neighbours.add(candidate);
      }
    });

    return neighbours;
  }

  static _buildPolygonsFromGeometry (geometry) {

    const polygons = [];
    const vertices = geometry.vertices;
    const faceVertexUvs = geometry.faceVertexUvs;

    // Constructing the neighbor graph brute force is O(n²). To avoid that,
    // create a map from vertices to the polygons that contain them, and use it
    // while connecting polygons. This reduces complexity to O(n*m), where 'm'
    // is related to connectivity of the mesh.
    const vertexPolygonMap = new Array(vertices.length); // array of polygon objects by vertex index
    for (let i = 0; i < vertices.length; i++) {
      vertexPolygonMap[i] = [];
    }

    // Convert the faces into a custom format that supports more than 3 vertices
    geometry.faces.forEach((face) => {
      const poly = {
        id: polygonId++,
        vertexIds: [face.a, face.b, face.c],
        centroid: face.centroid,
        normal: face.normal,
        neighbours: null
      };
      polygons.push(poly);
      vertexPolygonMap[face.a].push(poly);
      vertexPolygonMap[face.b].push(poly);
      vertexPolygonMap[face.c].push(poly);
    });

    // Build a list of adjacent polygons
    polygons.forEach((polygon) => {
      polygon.neighbours = this._buildPolygonNeighbours(polygon, vertexPolygonMap);
    });

    return {
      polygons: polygons,
      vertices: vertices,
      faceVertexUvs: faceVertexUvs
    };
  }

  static _getSharedVerticesInOrder (a, b) {

    const aList = a.vertexIds;
    const bList = b.vertexIds;

    const sharedVertices = new Set();

    aList.forEach((vId) => {
      if (bList.includes(vId)) {
        sharedVertices.add(vId);
      }
    });

    if (sharedVertices.size < 2) return [];

    if (sharedVertices.has(aList[0]) && sharedVertices.has(aList[aList.length - 1])) {
      // Vertices on both edges are bad, so shift them once to the left
      aList.push(aList.shift());
    }

    if (sharedVertices.has(bList[0]) && sharedVertices.has(bList[bList.length - 1])) {
      // Vertices on both edges are bad, so shift them once to the left
      bList.push(bList.shift());
    }

    // Again!
    const sharedVerticesOrdered = [];

    aList.forEach((vId) => {
      if (bList.includes(vId)) {
        sharedVerticesOrdered.push(vId);
      }
    });

    return sharedVerticesOrdered;
  }
}

export { Builder };
