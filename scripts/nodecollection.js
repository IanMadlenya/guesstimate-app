'use strict';

var Backbone = require("backbone");
require(['lodash'], function(_) {});

var multiplication = {
  name: 'multiplication',
  sign: 'x',
  apply(inputs){
    var product = _.reduce(inputs, function(product, n) { return product * n; })
    return product;
  }
}

var addition = {
  name: 'addition',
  sign: '+',
  apply(inputs){
    var sum = _.reduce(inputs, function(sum, n) { return sum + n; });
    return sum;
  }
}

var efunctions = {
  'multiplication': multiplication,
  'addition': addition
}

class group {
  constructor(node, graph){
    this.node = node
    this.graph = graph
  }
  edges(){
    return _.filter(this._allEdges().models, function(n){ return n.get(this.goTo) == this.node.id }, this)
  }
  getEdge(nodeId){
    return _.find(this.edges(), function(n){ return n.get(this.getFrom) == nodeId }, this)
  }
  getEdges(nodeIds){
    return _.map(nodeIds, function(nodeId){ return this.getEdge(nodeId) }, this)
  }
  nodeIds(){
    return _.map(this.nodes(), function(i){return i.id})
  }
  createEdge(nodeId){
    var newObject = {}
    newObject[this.goTo] = this.node.id
    newObject[this.getFrom] = nodeId
    return this._allEdges().create(newObject)
  }
  _allEdges(){ return this.graph.edges }
}

class outputs extends group{
  constructor(node, edges){
    this.getFrom = 1
    this.goTo = 0
    super(node,edges)
  }
  nodes(){
    return _.map(this.edges(), function(e){ return e.outputNode})
  }
}

class inputs extends group{
  constructor(node, edges){
    this.getFrom = 0
    this.goTo = 1
    super(node,edges)
  }
  nodes(){
    return _.map(this.edges(), function(e){ return e.inputNode})
  }
}

class Enode extends Backbone.Model{
  defaults(){
    return {
      foo: 'sillybar'
    }
  }
  setup(){
  }
  initialize(attributes){
    this.id = attributes.pid;
    this.outputs = new outputs(this, this.collection.graph)
    this.inputs = new inputs(this, this.collection.graph)
    this.setup()
  }
  inputEdges(){
  }
  outputEdges(){
  }
  edges(){
    return _.union(this.inputs.edges(), this.outputs.edges())
  }
  inputValues(){
    return _.map(this.inputs.nodes(), function(i){ return i.get('value')})
  }
  //outputs(){
    //return _.map(this.outputEdges(), function(e) {return e.outputNode})
  //}
  allOutputs(){
    var outputs = this.outputs.nodes()
    var furtherOutputs = _.map(outputs, function(e){return e.allOutputs()})
    return _.flatten([outputs, furtherOutputs])
    return outputs
  }
  //inputs(){
    //return _.map(this.inputEdges(), function(e) {return e.inputNode})
  //}
  toString(indent){
    //indent = indent || 0
    //var pid = this.get('pid')
    //var nodeType = this.get('nodeType')
    //var outputs = _.map(this.outputs(), function(e){return e.toString(indent + 1)})
    //var out_s = ""
    //if (outputs.length > 0){ //var out_s = ' outputs => \n' + outputs.joint('\n')
    //}
    //sstring = (Array(indent*3).join('.')) + "([" + pid + nodeType + "]" + out_s + ")"
    //return 'test'
  }
  toCytoscape() {
    var e = {}
    e.nodeId = this.id
    e.nodeType = this.attributes.nodeType
    _.merge(e, this.attributes)
    e.id = "n" + this.id // Nodes need letters for cytoscape
    e.name = this.toCytoscapeName()
    if (!e.name){ e.name = 'Add Name' }
    return {data: e};
  }

  toCytoscapeName(){
    var name = this.get('name')
    var value = this.get('value')
    var totalName = undefined
    if (value && name){
      totalName = value + ' - ' + name
    }
    else if (value || name){
      totalName = value || name
    }
    return totalName
  }
}

class EstimateNode extends Enode{
  ttype(){ return 'estimate' }
  propogate(){
    this.outputs.nodes().map( e => e.propogate() )
  }
}

  //node.value = null
class DependentNode extends Enode{
  ttype(){ return 'dependent' }
  inputFunction(){
    return this.inputs.nodes()[0]
  }
  propogate(){
    var newValue = this.inputFunction().calculate_output()
    this.set('value', newValue)
    this.outputs.nodes().map( e => e.propogate() )
  }
}


class FunctionNode extends Enode{
  ttype(){ return 'function' }
  defaults(){
    return {
      "functionType": 'addition'
    }
  }
  efunction(){
    var functionType = this.get('functionType')
    return efunctions[functionType]
  }
  dependent(){
    return this.outputs.nodes()[0]
  }
  propogate(){
    this.dependent().propogate()
  }
  calculate_output(){
    var clean = function(e){
      if (e){ return parseFloat(e) }
      else { return 0 }
    }
    var inputValues = this.inputValues().map(clean)
    return this.efunction().apply(inputValues)
  }
  toCytoscapeName(){
    return this.efunction().sign
  }
  getEdges(direction, edgeIds){
    if (direction === 'input'){
      var edges = this.inputEdges()
      var place = 0
    }
    else{
      var edges = this.outputEdges()
      var place = 1
    }
    return _.map(edgeIds, function(edgeId){
       return _.find(edges, function(l){return l.get(place) == edgeId})
    })
  }
  createInputEdge(toId){
    this.collection.graph.edges.create({0:toId, 1: this.id})
  }
  resetInputs(){
    var newInputs = _.map(this.get('inputs'), function(n){return parseInt(n)})
    var oldInputs = this.inputs.nodeIds()
    var shouldAdd = _.difference(newInputs, oldInputs)
    var shouldDelete = _.difference(oldInputs, newInputs)
    var shouldDeleteEdges = this.inputs.getEdges(shouldDelete)
    _.map(shouldDeleteEdges, function(n){n.destroy()})
    _.map(shouldAdd, function(n){this.inputs.createEdge(n)}, this)
  }
  setup(){
    this.on('change:inputs', function(f){ f.resetInputs() })
  }
}

var NodeCollection = Backbone.Collection.extend({
    model: function(attrs, options) {
      switch (attrs.nodeType){
        case 'estimate':
          return new EstimateNode(attrs, options)
        case 'dependent':
          return new DependentNode(attrs, options)
        case 'function':
          return new FunctionNode(attrs, options)
        default:
          return new Enode(attrs, options)
      }
    },
    url: '/foo/bar',
    initialize(collection, graph){
      this.graph = graph;
    },
    toCytoscape() {
      var nodes = _.map(this.models, function(d){
        return d.toCytoscape();
      });
      return nodes;
    },
    allOfTtype(ttype){
      return  _.select(this.models, function(n){ return n.ttype() === ttype} )
    }
});

module.exports = NodeCollection;