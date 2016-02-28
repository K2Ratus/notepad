"use strict";

var API_URL_REVISIONS_LIST = "https://www.googleapis.com/drive/v2/files/{fileId}/revisions?access_token={token}";
var fileId = null;
var token = null;


//NOTE:  "newer" and "older" may not actually be true when looking at modifiedDate, but should match the revision creation date (which oddly isn't part of the revision resource object in the API).

// Once we have the list of revisions we store them in instances of the following class:
var Rev = function(resource){
    this.etag = resource.etag; 
    this.date = ParseGoogleDate(resource.modifiedDate);
    this.downloadUrl = resource.downloadUrl;
    this.content = null;
    this.digits = null; //number of digits in last line number
    this.status = Rev.AWAITING_STREAM;
    this.startDomLines = [];
    this.endDomLines = [];
    this.lineIsUsed = [];

    //  Revs are doubly-linked in chronoligcal order (newer/older properties) with rev for lookups by etag
    this.newer = Rev.all[Rev.all.length-1]; 
    this.older = null;
    if(Rev.all.length) 
        Rev.all[Rev.all.length-1].older = this;
    Rev.all.push(this);
    Rev.fromEtag[this.etag] = this
        
    return this;
} 
Rev.fromEtag = {}; // list of revisions, using etag as the key
Rev.all = []; //list of revisions stored, with the most recent in 0, oldest at the end.  Note that indices may shift around (possibly).
//Status values, note we do rely on the order in GetState:
Rev.AWAITING_STREAM = 0; 
Rev.DOWNLOADING_CONTENT = 1;
Rev.AWAITING_NEWER_REVISION_CONTENT = 2;
Rev.DIFFED_WITH_NEWER = 3;
Rev.DIFFED_WITH_OLDER = 4;


var N_CONCURRENT_STREAMS = 20;
var nextStream = -1; //-1= not streamed anything yet, Infinity = streamed all
                     //othewise is a reference to the next Rev to stream
var awaitingEtagContent = {at: null, from: null}; //During streaming, we may already have a requested pair of
                                                 //revisions, we should call GetState as soon as we are ready.
var lineIsUsedIsValid = false; // when false we need to recompute Rev.lineIsUsed for all Rev instances.

var pendingState = {at: null,from: null};
var getStateTimeout = 0;


var LineTracker = function(){this.ind = null; return this}; 
var domLines = [];  // This will hold an array of LineTrackers objects. The array will be spliced into as we 
                    // insert into the Dom, then when we want to know the index of a line we go through and 
                    // set the .ind properties of all the domLines.

self.onmessage = function(e){
    if('token' in e.data)
        token = e.data.token;
        
    if('fileId' in e.data)
        fileId = e.data.fileId;
    
    if('init' in e.data)
        Init();
    
    if('showEtag' in e.data){
        // Don't call GetState immediately, put the request at the back of the queue and only actually make the call for the last requested at-from pair
        pendingState = {at:Rev.fromEtag[e.data.showEtag], from:Rev.fromEtag[e.data.fromEtag]} 
        clearTimeout(getStateTimeout)
        getStateTimeout = setTimeout(function(){GetState(pendingState.at,pendingState.from);},1);
    }
    
    if('debug' in e.data){
        postMessage({debug: "debug stuff", Rev_all:Rev.all, domLines: domLines});
    }
}
 
 
var ComputeAllLineIsUsedVectors = function(){
    var CloneUint8Array = function(a){
        var b =  new Uint8Array(a.length);
        b.set(a);
		return b;
    }
    
    var v = new Uint8Array(domLines.length);

    for(var i=0;i<v.length;i++)
        domLines[i].ind = i;
        
    for(var i=0;i<Rev.all.length; i++){
        var r = Rev.all[i];
        for(var j=0;j<r.startDomLines.length;j++)
            v[r.startDomLines[j].ind] = 1;
        r.lineIsUsed = CloneUint8Array(v);
        for(var j=0;j<r.endDomLines.length;j++)
            v[r.endDomLines[j].ind] = 0;    
    }
    
    lineIsUsedIsValid = true;
}

var GetState = function(at,from){
    awaitingEtagContent = {at: at, from: from};
    if(at.status < Rev.DIFFED_WITH_NEWER || from.status < Rev.DIFFED_WITH_NEWER)
        return;
    awaitingEtagContent = {at: null, from: null};
    
    if(!lineIsUsedIsValid)
        ComputeAllLineIsUsedVectors();
        
    var Combine11 = function(at,from){
        // maps: (0,0) => 0   (1,1) => 1   (1,0) => 3   (0,1) => 2
        return (at & from) //0 if in neither, 1 if in both
               | ((at ^ from) << 1) // plus 2 if only in one
               ^ (at & ~from); //and a final bit of sillyness
    }    
    
    var v_at = at.lineIsUsed;
    var v_from = from.lineIsUsed;
    var v = new Uint8Array(domLines.length);
    for(i=0;i<v.length;i++)
        v[i] = Combine11(v_at[i],v_from[i]);
        
    //Now v is 0 - not in <at> or <from>, i.e. "not relevant"
    //    v is 1 - is in both <at> and <from>, i.e. "equal"
    //    v is 2 - not in <at> but is in <from>, i.e. "removed"
    //    v is 3 - in <at> but not in <from>, i.e. "added"
    
    for(var prev=0,i=1;i<v.length;i++)if(v[i]>0)
        v[i] = v[i]==prev ? (prev=v[i]) : (prev=v[i]) + 10;
    // Now v is 0 - not in <at> or <from>, i.e. "not relevant"
    //    v is 1 - is in both <at> and <from>, i.e. "equal"
    //    v is 2 - not in <at> but is in <from>, i.e. "removed"
    //    v is 3 - in <at> but not in <from>, i.e. "added"
    // for 11,12,13 see 1,2,3 respectively, with the extra 10 indicating the first in a contigous (ignoring v=0) block
    
    postMessage({   at: at.etag,
                    from: from.etag,
                    vals_ui8buffer: v.buffer,
                    digits: at.digits},[v.buffer])
                    //remember that if we haven't finished streaming the dom may change after the main thread recieves this message
                    // but at the time the message is recieved it will be correct, because domLines here should match the true list of lines in the dom.
                    // (this relies on the single-threadedness of both the worker and the main thread...hooray for single-threadedness!)
    postMessage({status: "Showing the file as it was at:\n\t" +  
                        at.date.toLocaleTimeString({},{hour: "numeric",minute: "numeric"}) +
                         " on " + at.date.toLocaleDateString({},{month:"short",day:"numeric",year: "numeric"}) +
                        (at == from ? "\n\n(Not showing any changes.)" :
                         "\nWith changes relative to the file at:\n\t" +
                        from.date.toLocaleTimeString({},{hour: "numeric",minute: "numeric"}) +
                         " on " + from.date.toLocaleDateString({},{month:"short",day:"numeric",year: "numeric"}) )                    
               });
}

var Init = function(){
    
    // Clear old data (if there was any)
    Rev.all = [];
    nextStream = -1;
    domLines = [];
    lineIsUsedIsValid = false;
    
    postMessage({status: "Dowloading revision list..."});
    //Get revision list synchorously...
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API_URL_REVISIONS_LIST.replace("{fileId}",fileId).replace("{token}",token), false); 
    xhr.send();
    var newList = JSON.parse(xhr.responseText).items;
    
    //Store resourece items as Rev instances in the "all" array, statically attached to the Rev object
    while(newList.length)
        new Rev(newList.pop());
             
    //Tell the main thread about all the reviosions
    postMessage({ 
        revisions: Rev.all.map(function(r){ 
                        return {    etag: r.etag,
                                    modifiedDate: r.date    };
                })
        }); 
        
    postMessage({status: "Streaming revisions..."});
    //Start streaming a handful of revisions. Each time one returns it will trigger annother.
    //As revisions are downloaded, we start chainging together the diffs 
    nextStream = Rev.all[0];
    for(var i=0;i<N_CONCURRENT_STREAMS;i++)
        StreamAnotherRevision();
    
}

var StreamAnotherRevision = function(){
    if(!nextStream === -1 || nextStream === Infinity)
        return;
        
    var r = nextStream;
    r.status = Rev.DOWNLOADING_CONTENT;
    nextStream = r.older || Infinity;
    GetRevisionContentAsync(r);    
}

var GetRevisionContentAsync = function(r){
    
    var xhr = new XMLHttpRequest();
    xhr.open('GET', r.downloadUrl + "&access_token=" + token, true);
    xhr.onload = function (e) {
        if (xhr.readyState !== 4) 
            return;
            
        if (xhr.status !== 200) 
            throw Error(xhr.statusText);
            
        r.content = difflib.stringAsLines(xhr.responseText)
        r.digits = Math.floor(Math.log(r.content.length) / Math.log(10)) + 1;
        postMessage({revisionDownloaded: r.etag});
        
        StreamAnotherRevision(); //get that going while we do the diffing...
        
        if(!r.newer) // if this is the first revision we can now start diffing, (though we may have to wait before continuing)
            postMessage({status: "Streaming revisions and calculating differences..."});
        
            
        if(!r.newer || r.newer.status == Rev.DIFFED_WITH_NEWER) //r.newer is undefined for the first revision
            DiffNewest(r);   //there may be older revisions already downloaded that are waiting on this revision     
        else // r.newer.status = DOWNLOADING_CONTENT or AWAITING_NEWER_REVISION_CONTENT
            r.status = Rev.AWAITING_NEWER_REVISION_CONTENT;
            
    };
    
    xhr.onerror = function (e) {
        throw(xhr.statusText);
    };
    xhr.send();
}

var IncorporateFirstRevision = function(r){
    var Assign0 = function(dest,len){
        for(var i=0;i<len;i++) dest[i] = i;
    }
    
    r.linesToDom = new Uint32Array(r.content.length);
    Assign0(r.linesToDom,r.linesToDom.length);
    
    for(var i=0;i<r.linesToDom.length;i++)
        domLines.push(new LineTracker());
    r.startDomLines = domLines.slice(0);
    
    return [{at:0, lines: r.content.slice(0)}];
}

var IncorporateOlderRevision = function(newer,older){
    var sm = new difflib.SequenceMatcher(newer.content, older.content ); 
    //TODO: a new sm for each paire is a bit wasteful, we do pre-processing of each sequence twice, wehn we could reuse it somehow I believe.
    
    var opps = older.oppFromNewer = sm.get_opcodes();
    var newStuffForDom = [];
    var off = 0;


    var Assign0 = function(dest,len){
        for(var i=0;i<len;i++) dest[i] = i;
    }
    var AssignE = function(dest,src,d_ind,s_ind,off,len){
        while(len--) dest[d_ind++] = src[s_ind++] + off; 
    }
    var AssignIR = function(dest,src,d_ind,s_ind,off,len){
        var val = (s_ind < src.length ? src[s_ind] : src[src.length-1]+1) + off;
        var ret = val;
        while(len--) dest[d_ind++] = val++; 
        return ret;
    }

    var l2d_n = newer.linesToDom;
    var l2d_o = older.linesToDom = new Uint32Array(older.content.length);
    
    var off = 0;
    for(var i=0;i<opps.length;i++){
        var op = opps[i];
        if(op[0] == 'e'){
            // For EQUAL-blocks we just need to set the values in the new linesToDom mapping
            AssignE(l2d_o,l2d_n,op[3],op[1],off,op[4]-op[3])
            continue;
        }
        if(op[0] == 'd' || op[0] == 'r'){
            // For any blocks that delete lines (i.e. DELETE and REPLACE) we record which domLines are now "end"ed
            for(var j=op[1];j<op[2];j++)
                newer.endDomLines.push(domLines[l2d_n[j]+off]); //note we need "+off" because of changes that have occured in previous iterations of the  i-loop 
        }
        if(op[0] == 'i' || op[0] == 'r'){
            // For any blocks that insert lines (i.e. INSERT and REPLACE) we need both to record the new linesToDom mapping 
            //      *and* insert some new LineTracker instances into domLines[] and store the new LineTrackers as "start"s in the older revision
            var at = AssignIR(l2d_o,l2d_n,op[3],op[1],off,op[4]-op[3]);
            var lines = older.content.slice(op[3],op[4]);
            
            var spliceArgs = [at,0];
            for(var j=op[3];j<op[4];j++)
                spliceArgs.push(new LineTracker());
            Array.prototype.splice.apply(domLines,spliceArgs);  //splice the new LineTrackers into the domLines and..
            older.startDomLines = older.startDomLines.concat(spliceArgs.slice(2)); //...store them in older
            
            off += lines.length; //note that the offset only ever grows because we never delete stuff in the dom, only insert stuff
            newStuffForDom.push({at: at, lines: lines});
        }
        
    }
    /*
    if(opps[0][0] != 'e' || opps[0][2] < 20)
        postMessage({   opps0: opps[0].toString(),
                        opps1: opps[1].toString(),
                        l2d_n20: Array.prototype.concat.apply([],l2d_n.subarray(0,20)).toString(),
                        l2d_o20: Array.prototype.concat.apply([],l2d_o.subarray(0,20)).toString(),
                        newer: newer,
                        older: older,
                        opps_all: opps,
                        l2d_n_all: l2d_n,
                        l2d_o_all: l2d_o,
                        debug:"IOR"
            });
    */
    return newStuffForDom;
}

var DiffNewest = function(r){
    //starting with r, it calculates diffs for r.newer with r, then r with r.older and then continues
    //iteratively to r.older diffed with r.older.older etc. until we reach a revision that doesn't yet 
    //have content.
    
    r.status = Rev.AWAITING_NEWER_REVISION_CONTENT;
    
    if(r.newer && r.newer.status !== Rev.DIFFED_WITH_NEWER)
        return;  //ok, well, when the newer stuff has downloaded and diffed we'll deal with this revision
            
    while(r && r.status == Rev.AWAITING_NEWER_REVISION_CONTENT){
        var newStuffForDom;

        if(r.newer){
            newStuffForDom = IncorporateOlderRevision(r.newer,r);
            r.newer.status = Rev.DIFFED_WITH_OLDER; 
        }else{ //r.newer is undefined, i.e. this is the revision zero, the most recently saved revision.
            newStuffForDom = IncorporateFirstRevision(r);
        }
        r.status = Rev.DIFFED_WITH_NEWER;
        
        lineIsUsedIsValid = false;
        postMessage({revsionDiffed: r.etag,
                     rawOppFromNewer: r.oppFromNewer,
                     newStuffForDom: newStuffForDom
                    })
        
        // If the user wanted to see this revision then we can now send them the neccessary data
        // (actually we may still be waiting on an older revision, so the call below might not do much).
        if(awaitingEtagContent.at === r || awaitingEtagContent.from == r)
            GetState(awaitingEtagContent.at,awaitingEtagContent.from);
        
        r = r.older; //that's how this while loop works...
    }
    
    if(!r) //this means the final r.older was null, i.e. we've been all the way through
        postMessage({status: "All known revisions prepared."});

    
}


var ParseGoogleDate = function(d){
    //Copied (and simplified) from: http://stackoverflow.com/a/11318669/2399799
    var GOOGLE_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
    var m = GOOGLE_DATE_REGEX.exec(d);
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]);
}

/***
This is part of jsdifflib v1.0. <http://snowtide.com/jsdifflib>

Copyright (c) 2007, Snowtide Informatics Systems, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice, this
		list of conditions and the following disclaimer.
	* Redistributions in binary form must reproduce the above copyright notice,
		this list of conditions and the following disclaimer in the documentation
		and/or other materials provided with the distribution.
	* Neither the name of the Snowtide Informatics Systems nor the names of its
		contributors may be used to endorse or promote products derived from this
		software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
DAMAGE.
***/
/* Author: Chas Emerick <cemerick@snowtide.com> */
//JSlint made happy by DM.
//
//opcodes are 5-tuples of the form [tag,a_start,a_end,b_start,b_end].
//the tag has one of the following 4 values: r=replace, d=delete, i=insert, e=equal
//where the indicies define the relavant sections in seq_a and seq_b
//Only replace and equal actually require all 4 indicies, but they are present in all cases.
//a_start from opp_{n+1} = a_end from opp_{n}, and same for b_start and b_end
// see http://docs.python.org/2/library/difflib.html#difflib.SequenceMatcher
//
var __whitespace = {" ":true, "\t":true, "\n":true, "\f":true, "\r":true};

var difflib = {
	defaultJunkFunction: function (c) {
		return __whitespace.hasOwnProperty(c);
	},
	
	stripLinebreaks: function (str) { return str.replace(/^[\n\r]*|[\n\r]*$/g, ""); },
	
	stringAsLines: function (str) {
		var lfpos = str.indexOf("\n");
		var crpos = str.indexOf("\r");
		var linebreak = ((lfpos > -1 && crpos > -1) || crpos < 0) ? "\n" : "\r";
		
		var lines = str.split(linebreak);
		for (var i = 0; i < lines.length; i++) {
			lines[i] = difflib.stripLinebreaks(lines[i]);
		}
		
		return lines;
	},
	
	// iteration-based reduce implementation
	__reduce: function (func, list, initial) {
        var value, idx;
		if (initial !== null) {
			value = initial;
			idx = 0;
		} else if (list) {
			value = list[0];
			idx = 1;
		} else {
			return null;
		}
		
		for (; idx < list.length; idx++) {
			value = func(value, list[idx]);
		}
		
		return value;
	},
	
	// comparison function for sorting lists of numeric tuples
	__ntuplecomp: function (a, b) {
		var mlen = Math.max(a.length, b.length);
		for (var i = 0; i < mlen; i++) {
			if (a[i] < b[i]) return -1;
			if (a[i] > b[i]) return 1;
		}
		
		return a.length == b.length ? 0 : (a.length < b.length ? -1 : 1);
	},
	
	__calculate_ratio: function (matches, length) {
		return length ? 2.0 * matches / length : 1.0;
	},
	
	// returns a function that returns true if a key passed to the returned function
	// is in the dict (js object) provided to this function; replaces being able to
	// carry around dict.has_key in python...
	__isindict: function (dict) {
		return function (key) { return dict.hasOwnProperty(key); };
	},
	
	// replacement for python's dict.get function -- need easy default values
	__dictget: function (dict, key, defaultValue) {
		return dict.hasOwnProperty(key) ? dict[key] : defaultValue;
	},	
	
	SequenceMatcher: function (a, b, isjunk) {
		this.set_seqs = function (a, b) {
			this.set_seq1(a);
			this.set_seq2(b);
		};
		
		this.set_seq1 = function (a) {
			if (a == this.a) return;
			this.a = a;
			this.matching_blocks = this.opcodes = null;
		};
		
		this.set_seq2 = function (b) {
			if (b == this.b) return;
			this.b = b;
			this.matching_blocks = this.opcodes = this.fullbcount = null;
			this.__chain_b();
		};
		
		this.__chain_b = function () {
			var b = this.b;
			var n = b.length;
			var b2j = this.b2j = {};
			var populardict = {};
            var elt;
			for (var i = 0; i < b.length; i++) {
				elt = b[i];
				if (b2j.hasOwnProperty(elt)) {
					var indices = b2j[elt];
					if (n >= 200 && indices.length * 100 > n) {
						populardict[elt] = 1;
						delete b2j[elt];
					} else {
						indices.push(i);
					}
				} else {
					b2j[elt] = [i];
				}
			}
	
			for (elt in populardict) {
				if (populardict.hasOwnProperty(elt)) {
					delete b2j[elt];
				}
			}
			
			var isjunk = this.isjunk;
			var junkdict = {};
			if (isjunk) {
				for (elt in populardict) {
					if (populardict.hasOwnProperty(elt) && isjunk(elt)) {
						junkdict[elt] = 1;
						delete populardict[elt];
					}
				}
				for (elt in b2j) {
					if (b2j.hasOwnProperty(elt) && isjunk(elt)) {
						junkdict[elt] = 1;
						delete b2j[elt];
					}
				}
			}
	
			this.isbjunk = difflib.__isindict(junkdict);
			this.isbpopular = difflib.__isindict(populardict);
		};
		
		this.find_longest_match = function (alo, ahi, blo, bhi) {
			var a = this.a;
			var b = this.b;
			var b2j = this.b2j;
			var isbjunk = this.isbjunk;
			var besti = alo;
			var bestj = blo;
			var bestsize = 0;
			var j = null;
	
			var j2len = {};
			var nothing = [];
			for (var i = alo; i < ahi; i++) {
				var newj2len = {};
				var jdict = difflib.__dictget(b2j, a[i], nothing);
				for (var jkey in jdict) {
					if (jdict.hasOwnProperty(jkey)) {
						j = jdict[jkey];
						if (j < blo) continue;
						if (j >= bhi) break;
                        var k;
						newj2len[j] = k = difflib.__dictget(j2len, j - 1, 0) + 1;
						if (k > bestsize) {
							besti = i - k + 1;
							bestj = j - k + 1;
							bestsize = k;
						}
					}
				}
				j2len = newj2len;
			}
	
			while (besti > alo && bestj > blo && !isbjunk(b[bestj - 1]) && a[besti - 1] == b[bestj - 1]) {
				besti--;
				bestj--;
				bestsize++;
			}
				
			while (besti + bestsize < ahi && bestj + bestsize < bhi &&
					!isbjunk(b[bestj + bestsize]) &&
					a[besti + bestsize] == b[bestj + bestsize]) {
				bestsize++;
			}
	
			while (besti > alo && bestj > blo && isbjunk(b[bestj - 1]) && a[besti - 1] == b[bestj - 1]) {
				besti--;
				bestj--;
				bestsize++;
			}
			
			while (besti + bestsize < ahi && bestj + bestsize < bhi && isbjunk(b[bestj + bestsize]) &&
					a[besti + bestsize] == b[bestj + bestsize]) {
				bestsize++;
			}
	
			return [besti, bestj, bestsize];
		};
		
		this.get_matching_blocks = function () {
			if (this.matching_blocks !== null) return this.matching_blocks;
			var la = this.a.length;
			var lb = this.b.length;
	
			var queue = [[0, la, 0, lb]];
			var matching_blocks = [];
			var alo, ahi, blo, bhi, qi, i, j, k, x;
			while (queue.length) {
				qi = queue.pop();
				alo = qi[0];
				ahi = qi[1];
				blo = qi[2];
				bhi = qi[3];
				x = this.find_longest_match(alo, ahi, blo, bhi);
				i = x[0];
				j = x[1];
				k = x[2];
	
				if (k) {
					matching_blocks.push(x);
					if (alo < i && blo < j)
						queue.push([alo, i, blo, j]);
					if (i+k < ahi && j+k < bhi)
						queue.push([i + k, ahi, j + k, bhi]);
				}
			}
			
			matching_blocks.sort(difflib.__ntuplecomp);
	
			var i1 , j1, k1, block, i2, j2, k2;
            i1 = j1 = k1 = block = 0;
			var non_adjacent = [];
			for (var idx in matching_blocks) {
				if (matching_blocks.hasOwnProperty(idx)) {
					block = matching_blocks[idx];
					i2 = block[0];
					j2 = block[1];
					k2 = block[2];
					if (i1 + k1 == i2 && j1 + k1 == j2) {
						k1 += k2;
					} else {
						if (k1) non_adjacent.push([i1, j1, k1]);
						i1 = i2;
						j1 = j2;
						k1 = k2;
					}
				}
			}
			
			if (k1) non_adjacent.push([i1, j1, k1]);
	
			non_adjacent.push([la, lb, 0]);
			this.matching_blocks = non_adjacent;
			return this.matching_blocks;
		};
		
		this.get_opcodes = function () {
			if (this.opcodes !== null) return this.opcodes;
			var i = 0;
			var j = 0;
			var answer = [];
			this.opcodes = answer;
			var block, ai, bj, size, tag;
			var blocks = this.get_matching_blocks();
			for (var idx in blocks) {
				if (blocks.hasOwnProperty(idx)) {
					block = blocks[idx];
					ai = block[0];
					bj = block[1];
					size = block[2];
					tag = '';
					if (i < ai && j < bj) {
						tag = 'r'; 
					} else if (i < ai) {
						tag = 'd';
					} else if (j < bj) {
						tag = 'i'; 
					}
					if (tag) answer.push([tag, i, ai, j, bj]);
					i = ai + size;
					j = bj + size;
					
					if (size) answer.push(['e', ai, i, bj, j]);
				}
			}
			
			return answer;
		};
		
		// this is a generator function in the python lib, which of course is not supported in javascript
		// the reimplementation builds up the grouped opcodes into a list in their entirety and returns that.
		this.get_grouped_opcodes = function (n) {
			if (!n) n = 3;
			var codes = this.get_opcodes();
			if (!codes) codes = [['e', 0, 1, 0, 1]];
			var code, tag, i1, i2, j1, j2;
			if (codes[0][0] == 'e') {
				code = codes[0];
				tag = code[0];
				i1 = code[1];
				i2 = code[2];
				j1 = code[3];
				j2 = code[4];
				codes[0] = [tag, Math.max(i1, i2 - n), i2, Math.max(j1, j2 - n), j2];
			}
			if (codes[codes.length - 1][0] == 'e') {
				code = codes[codes.length - 1];
				tag = code[0];
				i1 = code[1];
				i2 = code[2];
				j1 = code[3];
				j2 = code[4];
				codes[codes.length - 1] = [tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)];
			}
	
			var nn = n + n;
			var group = [];
			var groups = [];
			for (var idx in codes) {
				if (codes.hasOwnProperty(idx)) {
					code = codes[idx];
					tag = code[0];
					i1 = code[1];
					i2 = code[2];
					j1 = code[3];
					j2 = code[4];
					if (tag == 'e' && i2 - i1 > nn) {
						group.push([tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)]);
						groups.push(group);
						group = [];
						i1 = Math.max(i1, i2-n);
						j1 = Math.max(j1, j2-n);
					}
					
					group.push([tag, i1, i2, j1, j2]);
				}
			}
			
			if (group && !(group.length == 1 && group[0][0] == 'e')) groups.push(group);
			
			return groups;
		};
		
		this.ratio = function () {
			var matches = difflib.__reduce(
							function (sum, triple) { return sum + triple[triple.length - 1]; },
							this.get_matching_blocks(), 0);
			return difflib.__calculate_ratio(matches, this.a.length + this.b.length);
		};
		
		this.quick_ratio = function () {
			var fullbcount, elt, i;
			if (this.fullbcount === null) {
				this.fullbcount = fullbcount = {};
				for (i = 0; i < this.b.length; i++) {
					elt = this.b[i];
					fullbcount[elt] = difflib.__dictget(fullbcount, elt, 0) + 1;
				}
			}
			fullbcount = this.fullbcount;
	
			var avail = {};
			var availhas = difflib.__isindict(avail);
			var matches = 0, numb = 0;
			for (i = 0; i < this.a.length; i++) {
				elt = this.a[i];
				if (availhas(elt)) {
					numb = avail[elt];
				} else {
					numb = difflib.__dictget(fullbcount, elt, 0);
				}
				avail[elt] = numb - 1;
				if (numb > 0) matches++;
			}
			
			return difflib.__calculate_ratio(matches, this.a.length + this.b.length);
		};
		
		this.real_quick_ratio = function () {
			var la = this.a.length;
			var lb = this.b.length;
			return difflib.__calculate_ratio(Math.min(la, lb), la + lb);
		};
		
		this.isjunk = isjunk ? isjunk : difflib.defaultJunkFunction;
		this.a = this.b = null;
		this.set_seqs(a, b);
	}
};
