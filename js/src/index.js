var socketURL  = 'ws://localhost:8124';
var doc        = document;
var remote     = doc.getElementById('remoteVideo');
var local      = doc.getElementById('localVideo');
var members    = doc.getElementById('members');
var server     = [{"url": "stun:stun.l.google.com:19302"}];
var peer       = null;
var memberList = null;
var chat       = null;
var websokcet  = null;
var accessName = "";
var uuid       = "";

//= require Observer.js
//= require PeerConnection.js
//= require MemberList.js
//= require UUID.js

// Check connection name
do {
  accessName = prompt('Enter your access name');
} while ( accessName === "" );

if ( accessName === "" ) {
  alert('Connected Canceled.');
  location.reload();
}

// volume 0
local.volume  = 0;
remote.volume = 0;

// Class Instantiate
websocket  = new WebSocket(socketURL);
peer       = new PeerConnection(Observer);
memberList = new MemberList(members);
uuid       = (new UUID())+""; // get string

websocket.onopen = function() {
  websocket.send(JSON.stringify({
    "type":       PeerConnection.MEMBER_ADDED,
    "accessName": accessName,
    "uuid":       uuid
  }));
};

window.addEventListener('unload', function() {
  websocket.send(JSON.stringify({
    "type": PeerConnection.MEMBER_REMOVED,
    "uuid": uuid
  }));
  try {
    peer.close();
  } catch ( e ) {}
});

window.peer = peer;

