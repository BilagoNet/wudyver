const listProxy = [{
  name: "caliph",
  url: "https://cors.caliph.my.id/"
}, {
  name: "jack04309487",
  url: "https://akinator.jack04309487.workers.dev/"
}, {
  name: "cors.eu",
  url: "https://cors.eu.org/"
}, {
  name: "cors.niceeli",
  url: "https://cors.niceeli.workers.dev/?"
}, {
  name: "cors.bbear",
  url: "https://cors.bbear.workers.dev/?"
}];
const randomIndex = Math.floor(Math.random() * listProxy.length);
const randomProxy = listProxy[randomIndex];
console.log(`Proxy Name: ${randomProxy.name}`);
export default randomProxy;