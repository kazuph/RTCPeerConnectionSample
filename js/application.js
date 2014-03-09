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

// Observer Interface
var Observer   = {};
Observer.onAddStream = function(evt) {
    console.log('Stream attached');
    remote.src = window.webkitURL.createObjectURL(evt.stream);
};

Observer.onRemoveStream = function(evt) {
    remote.src = '';
};
Observer.onNegotiationNeeded = function(evt) {
    console.log('Negotiation event');
    //this.peer.createOffer(this.onLocalDescrion, this.errorHandler);
};
Observer.onIceCandidate = function(evt) {
    if ( ! evt.candidate ) {
        return;
    }
    websocket.send(JSON.stringify({
        "candidate": evt.candidate,
        "type":      PeerConnection.MESSAGE_TYPE_CANDIDATE
    }));
};
Observer.onWebSocketMessage = function(evt) {
    var message = JSON.parse(evt.data),
        sessionDescription,
        candidate;

    switch ( message.type ) {
        case PeerConnection.MESSAGE_TYPE_SDP:
            sessionDescription = new RTCSessionDescription(message.sdp);
            if ( message.to && message.to === uuid ) {
                switch ( sessionDescription.type ) {
                    case PeerConnection.DESCRIPTION_TYPE_OFFER:
                        console.log('Remote description set');
                        console.dir(sessionDescription);
                        if ( confirm('接続名：' + message.accessName + 'からCallが届いています。応答しますか？') ) {
                            this.peer.setRemoteDescription(sessionDescription, function() {
                                this.createAnswer(message.from, message.sdp);
                            }.bind(this));
                        }
                        break;

                    case PeerConnection.DESCRIPTION_TYPE_ANSWER:
                        console.log('Local description set');
                        console.dir(sessionDescription);
                        this.peer.setRemoteDescription(sessionDescription);
                        this.observer.onConnectionCompleted();
                        break;
                }
            }
            break;

        case PeerConnection.MESSAGE_TYPE_CANDIDATE:
            if ( message.candidate ) {
                candidate = new RTCIceCandidate(message.candidate);
                this.addIceCandidate(candidate);
            }
            break;

        case PeerConnection.MEMBER_ADDED:
            memberList.add(message.uuid, message.accessName);
            break;

        case PeerConnection.MEMBER_REMOVED:
            memberList.remove(message.uuid);
            break;
    }
};
Observer.onConnectionCompleted = function() {
    console.log('Peer connection succeed!');
    remote.volume = 1;
    local.classList.add('connected');
};
Observer.onClosed = function() {
    remote.stop();
    local.classList.remove('connected');
};
Observer.onDataChannelOpened = function() {
    console.log('DataChannel opened.');
    console.log(this.dataChannel);
};

// ====================================================
// Peer Connection class
// ====================================================
function PeerConnection(observer) {
    this.observer    = this.bindObserver(observer);
    this.peer        = new webkitRTCPeerConnection({"iceServers": server});
    this.connected   = false;
    this.personID    = null;
    this.dataChannel = null;
    this.fileChannel = null;

    this.init();
    this.getUserMedia();
}

PeerConnection.DESCRIPTION_TYPE_OFFER  = "offer";
PeerConnection.DESCRIPTION_TYPE_ANSWER = "answer";
PeerConnection.MESSAGE_TYPE_SDP        = "sdp";
PeerConnection.MESSAGE_TYPE_CONNECTION = "connection";
PeerConnection.MESSAGE_TYPE_CANDIDATE  = "candidate";
PeerConnection.MESSAGE_TYPE_CHAT       = "chat";
PeerConnection.MEMBER_ADDED            = "member-added";
PeerConnection.MEMBER_REMOVED          = "member-removed";

PeerConnection.prototype.init = function() {
    this.peer.onicecandidate      = this.observer.onIceCandidate;
    this.peer.onaddstream         = this.observer.onAddStream;
    this.peer.onnegotiationneeded = this.observer.onNegotiationNeeded;
    websocket.onmessage           = this.observer.onWebSocketMessage;
};

PeerConnection.prototype.initDataChannel = function() {
    console.log('Initialized data channel');
    this.dataChannel.onopen    = this.observer.onDataChannelOpened  || function() {};
    this.dataChannel.onmessage = this.observer.onDataChannelMessage || function() {};
};

PeerConnection.prototype.initFileChannel = function() {
    console.log('Initialized file channel');
    this.fileChannel.onopen    = this.observer.onFileChannelOpened  || function() {};
    this.fileChannel.onmessage = this.observer.onFileChannelMessage || function() {};
};

PeerConnection.prototype.close = function() {
    this.peer.close();
    this.obserber.onClosed();
};

PeerConnection.prototype.bindObserver = function(observer) {
    var that = this;

    Object.keys(observer).forEach(function(key) {
        observer[key] = observer[key].bind(that);
    });

    return observer;
};

PeerConnection.prototype.addIceCandidate = function(candidate) {
    this.peer.addIceCandidate(candidate);
};

PeerConnection.prototype.createOffer = function(id) {
    console.log('Offer send: ' + id);
    // crate data channel
    this.createDataChannel();
    this.createFileChannel();
    this.peer.createOffer(function(description) {
        console.log('Offered SDP:' + description);
        this.peer.setLocalDescription(description, function() {
            websocket.send(JSON.stringify({
                "type":     PeerConnection.MESSAGE_TYPE_SDP,
                "sdp" :     description,
                "to"  :     id,
                "from":     uuid,
                "accessName": accessName
            }));
        });
        this.personID = id;
    }.bind(this));
};

PeerConnection.prototype.createAnswer = function(id, sdp) {
    console.log('Answer send: ' + id);
    this.peer.createAnswer(function(description) {
        console.log('Answered SDP:' + description);
        this.peer.setLocalDescription(description, function() {
            websocket.send(JSON.stringify({
                "type":     PeerConnection.MESSAGE_TYPE_SDP,
                "sdp" :     description,
                "to"  :     id,
                "from":     uuid
            }));
        });
        this.personID = id;
        this.peer.ondatachannel  = function(evt) {
            console.log('Handled datachannel event');
            console.log(evt);
            switch ( evt.channel.label ) {
                case 'RTCPeerDataChannel':
                    this.dataChannel = evt.channel;
                    this.initDataChannel();
                    break;
                
                case 'RTCPeerFileChannel':
                    this.fileChannel = evt.channel;
                    this.initFileChannel();
                    break;
            }
            this.observer.onConnectionCompleted();
        }.bind(this);

    }.bind(this));
};

PeerConnection.prototype.getUserMedia = function() {
    var peer = this.peer;

    navigator.webkitGetUserMedia(
        { audio: true, video: true },
        function(stream) {
            console.log('Media loaded');
            local.src = window.webkitURL.createObjectURL(stream);
            peer.addStream(stream);
        },
        this.errorHandler
    );
};

PeerConnection.prototype.createDataChannel = function() {
    this.dataChannel = this.peer.createDataChannel('RTCPeerDataChannel');
    this.initDataChannel();
};

PeerConnection.prototype.createFileChannel = function() {
    this.fileChannel = this.peer.createDataChannel('RTCPeerFileChannel');
    this.initFileChannel();
};

PeerConnection.prototype.errorHandler = function(err) {
    console.log(err.name + ':' + err.message);
};

// ====================================================
// Connected member list class
// ====================================================
function MemberList(node) {
    this.node = node;
    this.stub = document.createElement('li');

    this.init();
}

MemberList.prototype.init = function() {
    this.node.addEventListener('click', function(evt) {
        var target,
            id;

        if ( evt.target.tagName === "LI" ) {
            id = evt.target.getAttribute('data-uuid').slice(4);
            peer.createOffer(id);
        }
    }, false);
};

MemberList.prototype.add = function(id, name) {
    if ( id === uuid ) {
        return;
    }

    var li = this.stub.cloneNode();

    li.setAttribute('data-uuid', 'uuid' + id);
    li.appendChild(document.createTextNode('member: ' + name));
    this.node.appendChild(li);
    li.classList.add('active');
};

MemberList.prototype.remove = function(id) {
    var li   = this.node.querySelector('[data-uuid="uuid' + id + '"]'),
        node = this.node;

    if ( li ) {
        li.classList.remove('active');
        setTimeout(function() {
            node.removeChild(li);
        }, 1000);
    }
};

// ====================================================
// UUID class
// ====================================================
function UUID() {
    // @see http://codedehitokoto.blogspot.jp/2012/01/javascriptuuid.html
    this.uuid = [
        (((1+Math.random())*0x10000)|0).toString(16).substring(1),
        (((1+Math.random())*0x10000)|0).toString(16).substring(1),
        (((1+Math.random())*0x10000)|0).toString(16).substring(1),
        (((1+Math.random())*0x10000)|0).toString(16).substring(1),
        (((1+Math.random())*0x10000)|0).toString(16).substring(1),
        (((1+Math.random())*0x10000)|0).toString(16).substring(1),
        (((1+Math.random())*0x10000)|0).toString(16).substring(1),
        (((1+Math.random())*0x10000)|0).toString(16).substring(1)
    ].join("");

    this.init();
}

UUID.prototype.init = function() {
    var sign = doc.createElement('p'),
        node = doc.getElementById('uuid');

    sign.appendChild(doc.createTextNode('Your Peer connection id:  ' + this.uuid));
    node.appendChild(sign);
    node.classList.add('show');
};

UUID.prototype.toString = function() {
    return this.uuid;
};


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

