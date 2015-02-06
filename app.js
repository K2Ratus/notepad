"use strict";
// DRIVE NOTEPAD 2014
// by DM

var dn = {};
dn.VERSION_STR = '2014b';

// ############################
// Constants and defaults
// ############################
dn.CLIENT_ID = '591525900269';
dn.SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
   'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.appdata'
];
dn.DEFAULT_SETTINGS = {
ext: 'txt',
wordWrap: [true,null,null],
wordWrapAt: 80,
fontSize: 1,
widget_anchor: ['l',50,'t',10],
showGutterHistory: 1,
lastDNVersionUsed: '',
newLineDefault: 'windows',
historyRemovedIsExpanded: true,
softTabN: 4,
tabIsHard: 0,
widgetSub: 'general'
}
dn.DEFAULT_CUSTOM_PROPS = {
    newline: "detect",
    tabs: "detect",
    aceMode: "detect"
};
dn.IMPERSONAL_SETTINGS_KEYS = ["wordWrap","wordWrapAt","fontSize","widget_anchor","showGutterHistory","historyRemovedIsExpanded","tabIsHard","softTabN","widgetSub"];
dn.theme = "ace/theme/chrome"; 
dn.canShowDragDropError = true;
dn.MIN_FONT_SIZE = 0.3;
dn.MAX_FONT_SIZE = 5; 
dn.MAX_WRAP_AT = 200;
dn.MIN_WRAP_AT = 20;
dn.WRAP_AT_INCREMENT = 10;
dn.MAX_SOFT_TAB_N = 10;
dn.MIN_SOFT_TAB_N = 2;
dn.DETECT_TABS_SPACES_FRAC = 0.9;
dn.DETECT_TABS_TABS_FRAC = 0.9;
dn.DETECT_TABS_N_SPACES_FRAC = 0.99;
dn.DETECT_TABS_N_SPACES_FRAC_FOR_DEFAULT = 0.6;
dn.FONT_SIZE_INCREMENT = 0.15;
dn.ICON_MOUSEOVER_MS = 300;
dn.EDITOR_REFOCUS_TIME_MS = 500;
dn.ERROR_DELAY_MS = 5000;//5 seconds
dn.FIND_HISTORY_ADD_DELAY = 2000; //ms
dn.CLIPBOARD_INFO_DELAY = 500; //ms
dn.CLIPBOARD_MAX_LENGTH = 20; //TODO: decide whether a large clipboard slows page loads and whether we can do anything about it.
dn.isGettingToken = true;
dn.isShowingHistory = false;
dn.apis = {driveIsLoaded: false};
dn.theFile = {
    fileId: null,
    folderId: null,
    title: null,
    description: '',
    ext: '',
    loadedMimeType: '',
    newLineDetected: 'none', //'windows', 'unix','mixed', or 'none'
    tabDetected: {val: 'none'},
    isPristine: true, //true while the document has no unsaved changes (set to true when we request the save not when we get confirmation, but if there is a save error it will be reverted to false).
    mimeType: '',
    metaDataIsLoaded: false,
    contentIsLoaded: false,
    isSaving: false,
    isLoadingMetaData: false,
    isLoadingContent: false,
    dataToSave: {body: null, title: null, description: null}, //holds the values until confirmation of success for each
    generationToSave: {body: 0, title: 0, description: 0},//when saves return they check their this.description etc. against here and clear dataToSave if they match
    isReadOnly: false,
    isShared: false,
    isBrandNew: false, // true from the point of creating a new document till the point we get confirmation of a successful save
    isReadingFileObject: false, //this is used on drag and drop,
    customProps: {}, //these are the props potentially stored on the file using the custom properties API
    customPropExists: {}, //each of the custom props that actually exsits for the file will have an entry in this obj, with the key being the property and the value being true.
    savingTitleCount: 0 //tracks the number of active save request with just the title.  Whatever the resp, this number is decremented,
};
dn.changeLineHistory = [];
dn.lastChange = null;
dn.findingStr = "";
dn.find_resultMarkers = [];
dn.CHANGE_LINE_CLASSES =(function(rootStr,trueN,factor){
    var x = [''];
    for(var i=trueN;i;i--)for(var k=0;k<factor;k++)
        x.push(rootStr + i);
    return x;
})('recent_line_',8,5)
dn.CHANGE_LINE_CLASSES_RM =(function(rootStr,trueN,factor){
    var x = [''];
    for(var i=trueN;i;i--)for(var k=0;k<factor;k++)
        x.push(rootStr + i);
    return x;
})('recent_line_rm',8,5)
dn.SHORTCUTS_LIST = [
"cut|Ctrl-X|Cmd-X",    
"copy|Ctrl-C|Cmd-C",
"paste|Ctrl-V|Command-V",
"cycle clipboard|Cltr-[V then left or right arrow]|Command-[V then left or right arrow]",
"select all|Ctrl-A|Command-A",
"find|Ctrl(-Alt)-F",
"replace|Ctrl-R",
"go to line|Ctrl(-Alt)-L",
"undo|Ctrl-Z|Command-Z",
"redo|Ctrl-Shift-Z,Ctrl-Y|Command-Shift-Z,Command-Y",
" | ",
"toggle widget|Esc",
"save|Ctrl-S|Command-S",
"print|Ctrl(-Alt)-P|Command-P",
"file history|Ctrl-H|Command-H",
"new|Ctrl(-Alt)-N",
"open|Ctrl(-Alt)-O",
"  | ",
"to upper case|Ctrl-U",
"to lower case|Ctr-Shift-U",
"modify selection|Shift-(Ctrl-)(Alt-) {Down, Up, Left, Right, End, Home, PageDown, PageUp, End}|Shift-(Command-)(Alt-) {Down, Up, Left, Right, End, Home, PageDown,End}",
"copy lines down|Ctrl-Alt-Down|Command-Option-Down",
"copy lines up|Ctrl-Alt-Up|Command-Option-Up",
"center selection||Ctrl-L",
"fold all|Alt-0|Option-0",
"unfold all|Alt-Shift-0|Option-Shift-0",
"go to end|Ctrl-End,Ctrl-Down|Command-End,Command-Down",
"go to line end|Alt-Right,End|Command-Right,End,Ctrl-E",
"go to line start|Alt-Left,Home|Command-Left,Home,Ctrl-A",
"go to page down|PageDown|Option-PageDown,Ctrl-V",
"go to page up|PageUp|Option-PageUp",
"go to start|Ctrl-Home,Ctrl-Up|Command-Home,Command-Up",
"go to word left|Ctrl-Left|Option-Left",
"go to word right|Ctrl-Right|Option-Right",
"indent|Tab",
"outdent|Shift-Tab",
"overwrite|Insert",
"remove line|Ctrl-D|Command-D",
"remove to line end||Ctrl-K",
"remove to linestart||Option-Backspace",
"remove word left||Alt-Backspace,Ctrl-Alt-Backspace",
"remove word right||Alt-Delete",
"split line||Ctrl-O",
"toggle comment|Ctrl-7|Command-7",
"transpose letters|Ctrl-T"
]
dn.EXT_TO_MIME_TYPE = {
html:"text/html",
htm:"text/html",
js:"text/javascript",
pl:"application/x-perl",
xml:"text/xml",
c:"text/x-csrc",
cpp:"text/x-c++src",
h:"text/x-chdr",
json:"application/json",
php:"application/x-php",
svg:"text/html",
css:"text/css",
java:"text/x-java",
py:"text/x-python",
scala:"scala",
textile:"textile",
tex:"application/x-tex",
bib:"application/x-tex",
rtf:"application/rtf",
rtx:"application/rtf",
sh:"application/x-sh",
sql:"text/x-sql",
as:"text/x-actionscript"
//everything else is hopefully ok to be text/plain.
}
dn.TOOLTIP_INFO = { //keys correspond to icon data-info attr, which will be the same as keys in SHORTCUTS_LIST
    "save" : "Save file contents.  ",
    "print": "Open print view in a new tab.  ",
    "sharing": "View and modify file's sharing status.",
    "file history": "Explore the file history.  ",
    "drive": "Show this file in Google Drive.  ",
    "about": "Drive Notepad website.",
    "shortcuts": "Keyboard shortcuts.",
    "new": "Create new file in a new tab.  ",
    "open": "Launch open dialoag.  ",
    "settings_file": "Properties of the current file.",
    "settings_general": "Your general Drive Notepad preferences.",
    "title": "Click to edit the file's title.",
    "description": "Click to edit the file's description."
}
var WHICH = {
ENTER: 13,
ESC: 27,
UP: 38,
DOWN: 40
};
/* ################################################################################################################

    [Some Notes on settings in Drive Notepad]

    There are two kinds of settings: per-user settings and per-file settings.
    
    The user settings are stored in dn.g_settings. When the page is loaded this is a fake Google Realtime model, which uses a mixture of default values and values read from localStorage.  At some point after authenticating the g_settings will become the true Google Realtime model. Whenever a value in g_settings is changed dn.SettingChanged is called with the appropriate paramaters, this is true right from when the page loads, i.e. the first set of values trigger the SettingsChanged, but after that only modifications will trigger a change (regardless of whether g_settings is the true model or not).  Use the .set() and .get() methods on the dn.g_settings.
    
    The per-file settings are stored in dn.theFile.customProps.  When the page is loaded they are initialised with default values.  Then, if we have opened an existing file, at some point they will be updated with the true values.  These settings are *not* a realtime model, rather they are Custom Properties (there's an API for it).  Again, as with the per-user settings, whenever the file settings are changed they trigger a call to PropertyUpdated.  Note that since this is not backed by a realtime model we won't get changes on the server push to the browser, only local changes will be observed.  The per-file settings are shared across anyone who has read and/or write access to the file in question. Note that if the default value is chosen the setting value is simply removed from the file.  Use the dn.SetProperty() function to set values and read values straight from the dn.theFile.customProps object.
    
    For each key "Something" in customProps there is a function dn.ApplySomethingChoice() which will read the per-user and/or the per-file settings (as appropriate) and use the combined result to apply the chosen setting to the editor, additionally the function will render the file settings tab and/or the general settings tab. As part of this function there will likely be a call to dn.DetectSomething, which will run some fairly simple heuristic over the current file.  [TODO: may want to cache this, as it can end up getting called several times during loading and possibly elsewhere.] [TODO: may want to have an ApplySomethingChoice for all settings not just those that are covered by customProps.]

################################################################################################################## */




// ############################
// Custom jQuery plugins
// ############################

$.fn.translate = function(x,y){
   var str = x==null ? "" : "translate(" + x + "px," + y + "px)";
   this.css({
      transform: str,
      webkitTransform: str,
      mozTransofrm: str
   });
   return this;
}

$.fn.cssAnimation = function(cls,callback,delay){
    this.toggleClass(cls,false).offset(); //forces class to be removed, so we can actually re-add it.
    var animTimer = this.data('animTimer');    
    if(animTimer)
		clearTimeout(animTimer);
	this.data('animTimer',setTimeout(callback,delay)); //this is better than trying to use the endtransition event
	this.toggleClass(cls,true);
	return this;
}

$.fn.textMulti = function(text,truncateLongWords){
	if(truncateLongWords){
		text = text.replace(/(\S{25})\S*/g,'$1...'); 
	}
	this.text(text);  
    this.html(this.html().replace(/\n/g,'<br/>').replace(/\t/g,'&nbsp;&nbsp;&nbsp; '));
    return this;
}

$.fn.fixHeightFromAuto = function(){
    var heights = [];
    var d = this.get();
    for(var i=0;i<d.length;i++)
        heights.push(getComputedStyle(d[i]).height);
    
	this.each(function(ind){this.style.height = heights[ind];});

    return this;
}

$.fn.insertClonedChildren = function(index,$src,textArray,attrObjArrays){
    //inserts new nodes before this.children(index)
    //the new nodes are based on $src, with text set according to the elements of textArray
    //attrObjArrays is an optional arrays of objects giving key names and values
    
    var src = $src.get(0);
    var frag = document.createDocumentFragment();
    
    textArray.map(function(str,ind){
                    var a = src.cloneNode(false); 
                    a.textContent = str;
                    if(attrObjArrays)for(var attr in attrObjArrays[ind])
                        a.setAttribute(attr,attrObjArrays[ind][attr]);
                    frag.appendChild(a);
                });
    
    var parent = this.get(0);
    var new_$els = $(Array.prototype.slice.call(frag.children,0));
    parent.insertBefore(frag,parent.children[index]);
    
    return new_$els;
}

 
// ############################
// Custom Select dropdown 
// ############################

var DropDown = function(valArray){
    //constructor, must use <new>
    
    var str = valArray.map(function(val){
                    return "<div class='dropdown_item'>" + val + "</div>";
                 }).join("");
    
    this.valArray = valArray.slice(0); 
    this.$list = $("<div class='dropdown_itemlist' tabindex='-1'/>").append(str);
    this.$collapsed = $("<div class='dropdown_collapsed'/>");
    
    this.$el = $("<div class='dropdown'/>").append(this.$list.hide()).append(this.$collapsed);
    this.ind = 0;
    this.$collapsed.text(valArray[0]);
    this.eventCallbacks = {}; //map of $.Callbacks() 
    this.open = false;
    
    var dd = this;

    this.$collapsed.on('mousedown',function(){
        if(!dd.trigger("click"))
            return;
        dd.$collapsed.attr("selected",true);
        dd.$list.show();
        this.open = true;
        setTimeout(function(){
            dd.$list.focus();
            dd.$list.scrollTop(dd.$list.scrollTop() + dd.$list.children().eq(dd.ind).position().top);
        },1);
    });
    this.$list.on('blur',function(e){
        dd.$list.hide();
        this.open = false;
        dd.trigger("blur");
    })
    this.$list.on("click",".dropdown_item",function(){
        dd.SetInd($(this).index());
        dd.$list.hide();
        this.open = false;
    })
    
    return this;
}
DropDown.FakeEvent = function(){//static subclass
    this.isStopped = false;
}
DropDown.FakeEvent.prototype.stopImmediatePropagation = function(){
    this.isStopped = true;
}

DropDown.prototype.on = function(evt,func){
    if(!(evt in this.eventCallbacks))
        this.eventCallbacks[evt] = $.Callbacks();
    
    this.eventCallbacks[evt].add(func);
}
DropDown.prototype.off = function(evt,func){
    if(!evt in this.eventCallbacks)
        return;
    if(!func)
        this.eventCallbacks[evt] = undefined;
    else
        this.eventCallbacks[evt].remove(func);
}
DropDown.prototype.trigger = function(evt,args){
    var fe = new DropDown.FakeEvent();
    if(evt in this.eventCallbacks){
        this.eventCallbacks[evt].fireWith(fe);
        if(fe.isStopped)
            return false;
    }
    return true;
}
DropDown.prototype.IndexOf = function(val){
    return this.valArray.indexOf(val);
}

DropDown.prototype.GetVal = function(){
    return this.valArray[this.ind];
}

DropDown.prototype.SetInd = function(ind,noTrigger){
    if(ind === this.ind)
        return;
    this.$list.children().eq(this.ind).removeAttr("selected");
    this.$collapsed.text(this.valArray[ind]);
    this.ind = ind;
    this.$list.children().eq(ind).attr("selected",true);
    if(!noTrigger)
        this.trigger("change",{ind:ind,str:this.valArray[ind],isOpen: this.open});
}

DropDown.prototype.SetSelected = function(v){
    if(v)
        this.$collapsed.attr("selected",true);
    else
        this.$collapsed.removeAttr("selected");
}

                
// ############################
// Worker wrapper
// ############################

Worker = (function(){  
	var nativeWorker = Worker;

	// This class (fully?) wraps the native Worker
	// but the advantage is that it can be returend immediately while we asynchrounously
	// download the worker code from another location and put it into a blob.
	// Once the true worker is ready we apply any queued function calls
	var BlobWorker = function(){
		this.queuedCallList = [];
		this.trueWorker = null;
		this.onmessage = null;
	}
	BlobWorker.prototype.postMessage = function(){
		if(this.trueWorker)
			this.trueWorker.postMessage.apply(this.trueWorker,arguments);
		else
			this.queuedCallList.push(['postMessage',arguments]);
	};
	BlobWorker.prototype.terminate = function(){      
		if(this.trueWorker)
			this.trueWorker.terminate();
		else
			this.queuedCallList.push(['terminate',arguments]);
	}

	BlobWorker.prototype.FileDataReceived = function(script){
		this.trueWorker = new nativeWorker(window.URL.createObjectURL(new Blob([script],{type:'text/javascript'})));
		if(this.onmessage)
			this.trueWorker.onmessage = this.onmessage;

		while(this.queuedCallList.length){
			var c = this.queuedCallList.shift();
			this.trueWorker[c[0]].apply(this.trueWorker,c[1]);
		}
	}

	return function(url){
		var w = new BlobWorker();
		$.ajax(url,{
                crossDomain: true,//because of the base tag in the page head jquery thinks this is same origin, but really it is cors.  this helps.
				success: $.proxy(w.FileDataReceived,w),
				error: function(s,err){throw err},
				dataType:"text"});
		return w;
	};
})();

 
// ############################
// Custom utils
// ############################

dn.OxfordComma = function(arr){
    switch (arr.length){
        case 1:
            return arr[0];
        case 2:
            return arr[0] + " and " + arr[1];
        case 3:
            return arr[0] + ", " + arr[1] + ", and " + arr[2];
    }
}
// ############################
// Auth stuff
// ############################

dn.Reauth = function(callback){ 
    dn.isGettingToken = false;
    dn.ShowStatus();
    
    gapi.auth.authorize(dn.auth_map(true),
                            function(){
                                dn.isGettingToken = false;
                                dn.ShowStatus();
                                callback();
                            });
}
dn.handleAuthResult = function(authResult) { 
    if (authResult && !authResult.error) {
      dn.isGettingToken = false;
      // Access token has been successfully retrieved, requests can be sent to the API
      gapi.client.load('drive', 'v2', function(){dn.APILoaded('drive')});
	  gapi.client.load('oauth2','v2', function(){dn.APILoaded('userinfo')});
	  gapi.load('drive-realtime', function(){dn.APILoaded('drive-realtime')});
      gapi.load('picker', function(){dn.APILoaded('picker');});
      gapi.load('drive-share', function(){dn.APILoaded('sharer');});
	} else {
	  // No access token could be retrieved, force the authorization flow.
	  dn.ShowPopupButton();
	} 
}

dn.LaunchPopup = function(){
  gapi.auth.authorize(dn.auth_map(false), 
    				dn.handleAuthResult);
}

dn.ShowPopupButton = function(){
	dn.$widget_text.text("Please click the button below to launch a Google popup window:");
	dn.$widget_popup_button.show();
	dn.$widget.cssAnimation('shake',function(){},dn.ERROR_DELAY_MS);
}

dn.CreatePopupButton = function(){
	var $d = $("<div class='widget_popup_button'><div class='major_button popupbutton'>Login and/or grant app permissions...</div>This will allow you to login to your Google account if you have not already done so, and if this is your first time using the latest version of Drive Notepad you will be asked to review and grant the app certain access permisions. <br><br>This will not normally be required when you use the app. <br><br>If you do not see a popup window when you click the button you may need to disable your popup blocker and reload the page.</div>");
	$d.find('.popupbutton').click(function(){
		$d.hide();
		dn.$widget_text.text("Popup window...");
		dn.LaunchPopup();
	});
	dn.$widget_menu.after($d.hide());
	dn.$widget_popup_button = $d;
}


// ############################
// Sharing stuff
// ############################

dn.DoShare = function(){
    if(!dn.theFile.fileId){
        dn.ShowError("You cannot view/modify the sharing settings until you have saved the file.")
        return false;
    }

    alert("In a moment you will see the Google Sharing dialog.  Please note that whatever information you see there will be correct - and you can make changes to it in the dialog. \nHowever, until you refresh the page, Drive Notepad will " + 
        (dn.theFile.isShared ? "continue to show the file as being 'shared' even if that is no longer true." :
        "not show any indication that the file is now shared (if that is what you choose).") +
        "\nHopefully this will be fixed at some point soon!")
        
    dn.$shareDialog.setItemIds([dn.theFile.fileId]);
    dn.$shareDialog.showSettingsDialog();
    
    //TODO: see SO question about no callback for share dialog...how are we supposed to know when it's closed and what happened?
    return false;
}


// ############################
// Newline stuff
// ############################
dn.CreateNewLineMenuTool = function(){
    dn.$newline_menu_windows.click(function(){
        dn.g_settings.set('newLineDefault','windows');
    });
    dn.$newline_menu_unix.click(function(){
        dn.g_settings.set('newLineDefault','unix');
    });
}

dn.DetectNewLine = function(str){
    dn.theFile.newLineDetected = (function(){
        //no special reason to use a self-executing function here, it's just lazy coding
        var first_n = str.indexOf("\n");
        if(first_n == -1)
            return dn.ShowNewlineStatus("none");
    
        var has_rn = str.indexOf("\r\n") != -1;
        var has_solo_n = str.match(/[^\r]\n/) ? true : false;
        
        if(has_rn && !has_solo_n)
            return dn.ShowNewlineStatus("windows");
        if(has_solo_n && !has_rn)
            return dn.ShowNewlineStatus("unix")
        
        return dn.ShowNewlineStatus("mixed");
    })();    
}

dn.ApplyNewlineChoice = function(str){
        
    var newlineDefault = dn.g_settings.get('newLineDefault');
    
    if(newlineDefault == "windows"){
        dn.$newline_menu_windows.attr("selected",true)
        dn.$newline_menu_unix.removeAttr("selected");
    }else{//newlineDefault should be unix
        dn.$newline_menu_unix.attr("selected",true)
        dn.$newline_menu_windows.removeAttr("selected");
    }             
                
   if(typeof str == "string")
       dn.DetectNewLine(str); //Note that it only makes sense to detect new line on downloaded content
   
   dn.ShowNewlineStatus(dn.theFile.newLineDetected); //if default changes after load or we have a new file we need this.
   
    dn.$file_newline_detect.removeAttr("selected");
    dn.$file_newline_windows.removeAttr("selected");
    dn.$file_newline_unix.removeAttr("selected");
   if(dn.theFile.customProps.newline == "detect"){
        if(dn.theFile.newLineDetected == "windows" || dn.theFile.newLineDetected == "unix")
            dn.editor.session.setNewLineMode(dn.theFile.newLineDetected);
        else
            dn.editor.session.setNewLineMode(newlineDefault);    
        dn.$file_newline_detect.attr("selected",true);
    }else{
        dn.editor.session.setNewLineMode(dn.theFile.customProps.newline);
            if(dn.theFile.customProps.newline == "windows")
                dn.$file_newline_windows.attr("selected",true);
            else
                dn.$file_newline_unix.attr("selected",true);
            
    }    
}

dn.ShowNewlineStatus = function(statusStr){
    var str;
    switch(statusStr){
        case 'none':
            str =  "no newlines detected, default is " + dn.g_settings.get("newLineDefault") + "-like";
            break;
        case 'mixed':
            str = "mixture of newlines detected, default is " + dn.g_settings.get("newLineDefault") + "-like";
            break;
        default:
            str = "detected " + statusStr + "-like newlines";
    }
    
    dn.$file_newline_info.text("(" + str +")");
    
    return statusStr;
}

// ############################
// First time usage stuff
// ############################

dn.ShowFirstTimeUserInfo = function(){
    var $d = $("<div class='widget_box widget_firstime'>" +
    "<div class='widget_box_title widget_firsttime_title'>First-time usage tips</div>" +
    "<ol><li>You can move this thing around by dragging the square in the top left corner.</li>" +
    "<li>To access the menu click the status text above or use the shortcut key, Esc</li>" +
    "<li>Changes are not saved as you type, you have to press save in the menu or use the shortcut key, " +
        (dn.platform == "Mac" ? "Cmd" : "Ctrl" ) + "-S.</li>" +
    "</ol>" +
    "<div class='major_button firsttime_dissmiss'>Dismiss</div>" + 
    "</div>");
    $d.find('.firsttime_dissmiss').click(function(){$d.hide();})
    dn.$widget_menu.after($d);
}

dn.Show2014bUserInfo = function(){
    var $d = $("<div class='widget_box widget_firstime'>" +
    "<div class='widget_box_title widget_firsttime_title'>App recently updated</div>" +
    "<ol><li>The menu is now more compact, with a tab for file properties and a tab for general settings.</li>" +
    "<li>You can now save syntax, newline, and tab modes for individual files.</li>" +
    "<li>Changes to the filename or description are now saved immediately.</li>" +
    "</ol><br>" +
    "Please " +
    "<a target='_blank' href='https://plus.google.com/communities/107691649945880497995/stream/8eb03018-2300-43b0-85d6-8bf901cb64ac'>" +
    "report bugs here</a> and hopefully they can be resolved quickly." +
    "<div class='major_button firsttime_dissmiss'>Dismiss</div>" + 
    "</div>");
    $d.find('.firsttime_dissmiss').click(function(){$d.hide();})
    dn.$widget_menu.after($d);
}

// ############################
// Open stuff
// ############################

dn.DoOpen = function(){
    if(!dn.openPicker){
        var view = new google.picker.View(google.picker.ViewId.DOCS);
        dn.openPicker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .setAppId(dn.CLIENT_ID)
        .setOAuthToken(gapi.auth.getToken().access_token)
        .addView(view)
        .setCallback(dn.PickerCallback)
        .build();
    }
    dn.openPicker.setVisible(true);
    return false;
}

dn.CreateOpenTool = function(){
    dn.$menu_open.click(dn.DoOpen);
    var $d = $("<div class='widget_box widget_open_tab_choice'>Open file in: <a class='major_button opener_button' id='opener_button_a' target='_self'>this tab</a><a class='major_button opener_button' id='opener_button_b' target='_blank'>a new tab</a></div>");
    dn.$opener_button_a = $d.find('#opener_button_a').click(function(){dn.$opener_chooser.hide();});
    dn.$opener_button_b = $d.find('#opener_button_b').click(function(){dn.$opener_chooser.hide();});
    dn.$widget_menu.after($d.hide());
    dn.$opener_chooser = $d;
}

dn.PickerCallback = function(data) {
  if (data.action == google.picker.Action.PICKED) {
    var fileId = data.docs[0].id;
    dn.ReclaimFocus();
    var url = window.location.href.match(/^https?:\/\/[\w-.]*\/\w*/)[0] +
              "?state={\"action\":\"open\",\"ids\":[\"" + fileId +"\"]}";
    dn.$opener_button_a.attr('href',url);
    dn.$opener_button_b.attr('href',url);
    dn.ToggleWidget(false);
    dn.$opener_chooser.show();
    dn.$widget.cssAnimation('shake',function(){},dn.ERROR_DELAY_MS);
  }else if(data.action == "cancel"){
      dn.ReclaimFocus();
  } 
}

// ############################
// Find replace stuff
// ############################

//A "quick", no sorry, a "longish" note:
//Each time DoFind runs it stores its str in dn.findingStr for next time.
//dn.findHistoryPointer is nan except when we are cycling through history. As soon 
//as we change the search string we leave this history-cyclying mode.  Also, immediately before
//entering the history-cycling mode we store the current str at the top of the history so it's
//available to come back to.
//A search is added to the history if it's not the empty string and has not been modified for 
//dn.FIND_HISTORY_ADD_DELAY milliseconds.
//Dealing with focus is a bit of a pain.  Basically either of the two input boxes may have it
//or a third party (such as the editor itself) may have it. We only want to show the markings
//when one of the two input boxes has the focus and not otherwise.  Also, while the inputs have the focus
//they disable the editor's steal-back-the-focus timer, which normally ensures it doesn't loose the focus.
//So we need to make sure that timer is reneabled when the focus is with neither of the two inputs.
//To make this work, whenver one of the inputs loses focus (the "blur" event) it triggers a delayed
//call to BlurFindAndFocusEditor, the fact that it is delayed allows the other input to cancel
//the call if it is the thing recieving the focus, otherwise it will go ahead.
//There are other complications too, but this is the bulk of it.
dn.DoFind = function(str){
    //this function is to be used internally by the find/replace functions
    
    while(dn.find_resultMarkers.length)
        dn.editor.session.removeMarker(dn.find_resultMarkers.pop());
                
    if(str == ""){
        dn.$findreplace_info.html("Type to search.<br>Ctrl-Up/Down: cycle though history")
    }else{
        var search = dn.editor.$search;
        search.set({needle: str});
        dn.editor.find(str,{skipCurrent: false});
        var r = search.findAll(dn.editor.session);
        if(r && r.length > 0){
            for(var i=0;i<r.length;i++)
                dn.find_resultMarkers.push(dn.editor.session.addMarker(r[i], "find_result", "find_result",false)); 
            
                dn.$findreplace_info.html("Found " + r.length + " occurances<br>" +
                 "Enter: find next<br>Shift+Enter: find previous<br>Esc: hide the find/replace box" +
                 (dn.showingReplace ?  "<br>Tab: focus on replace field" : "") + "<br>Ctrl-Up/Down: cycle though history");
        }else{
            dn.$findreplace_info.html("No occurences found.<br>Ctrl-Up/Down: cycle though history")
        }
    }
    dn.findingStr = str;
    if(dn.g_findHistory && isNaN(dn.findHistoryPointer)){
        if(dn.findHistoryAddTimeout)
            clearTimeout(dn.findHistoryAddTimeout);
        if(str.length)
            dn.findHistoryAddTimeout = setTimeout(function(){dn.AddToFindHistory(str);},dn.FIND_HISTORY_ADD_DELAY)
    }
}

dn.AddToFindHistory = function(str){
    clearTimeout(dn.findHistoryAddTimeout); // in case this was called directly
    dn.findHistoryAddTimeout = 0;
    if(!str.length || !isNaN(dn.findHistoryPointer))
        return;
        
        //TODO: there is an inconsistency here: the find is case-insensitive, but lastIndexOf is case sensitiv
    if(dn.g_findHistory.lastIndexOf(str) != -1)
        dn.g_findHistory.remove(dn.g_findHistory.lastIndexOf(str)); //if the string was already in the list somewhere we remove the old item so that values are unique
    //note that strictly speaking I think these operations should be done within a pair batching flags, but it doesn't really matter here.
    dn.g_findHistory.push(str); 
}

dn.CancelBlurFindAndFocusEditor = function(){
    clearTimeout(dn.blurFindAndFocusEditorTimer);
    dn.blurFindAndFocusEditorTimer = 0;
}
dn.BlurFindAndFocusEditor = function(flag){
    clearTimeout(dn.blurFindAndFocusEditorTimer);
    dn.blurFindAndFocusEditorTimer = 0;
    if(flag==="delay"){
        dn.blurFindAndFocusEditorTimer = setTimeout(dn.BlurFindAndFocusEditor,10); //this gives the other input element time to cancel the closing if there is a blur-focus event when focus shifts
        return; //note that we are assuming here that the blur event is triggered on the first element *before* the focus is triggered on the second element..if that isn't guaranteed to be true we'd need to check whether the second element already has the focus when the first element gets its blur event.
    }
    dn.showingFindResults = false;
    dn.ReclaimFocus();
    while(dn.find_resultMarkers.length)
        dn.editor.session.removeMarker(dn.find_resultMarkers.pop());               
}

dn.CreateFindReplace = function(){
    var $d = $("<div class='widget_box widget_findreplace'>" +
                "<input class='find_input' tabindex='1' placeholder='find text'></input>" +
                "<div class='replace_form'><input tabindex='2' class='replace_input' placeholder='replace with'></input></div>" + 
                "<div class='findreplace_info'></div>"+
                "</div>");
    dn.$replace_form = $d.find(".replace_form");
    dn.$findreplace_info = $d.find('.findreplace_info');
    dn.$find_input = $d.find(".find_input");
    dn.$replace_input = $d.find(".replace_input");
    dn.$widget_menu.after($d.hide());
    dn.$widget_findreplace = $d;         
    
    dn.$find_input.focus(function(){
                        dn.CancelBlurFindAndFocusEditor();
                        dn.showingFindResults = true;
                        if(dn.showingReplace)
                            dn.$replace_input.attr("tabindex",parseInt(dn.$find_input.attr("tabindex"))+1); //we want to force the replace input to always be the next tab index
                        dn.DoFind(dn.findingStr);
                    })
                  .blur(function(){
                        if(dn.showingReplace)
                            dn.BlurFindAndFocusEditor("delay");
                        else
                          dn.BlurFindAndFocusEditor();
                    })
                  .on("keydown",function(e){ //we want keydown here so that we can get repeated firing whith keydown (i think on most browsers)
                      if(e.which == WHICH.ENTER)
                        if(e.shiftKey)
                            dn.editor.findPrevious();
                        else
                            dn.editor.findNext();
                                                 
                        if(e.which == WHICH.ESC){
                            dn.BlurFindAndFocusEditor(); 
                            //the normal togglewidget shortcut will kick in
                        }
                        if(e.ctrlKey && (e.which == WHICH.UP || e.which == WHICH.DOWN)){
                            if(isNaN(dn.findHistoryPointer)){
                                dn.AddToFindHistory(dn.findingStr);  //when we begin delving into history
                                dn.findHistoryPointer = dn.g_findHistory.length-1;
                            }
                            dn.findHistoryPointer += e.which == WHICH.DOWN? -1 : +1;
                            dn.findHistoryPointer = dn.findHistoryPointer < 0 ? 0 : dn.findHistoryPointer;
                            dn.findHistoryPointer = dn.findHistoryPointer > dn.g_findHistory.length-1 ? dn.g_findHistory.length-1 : dn.findHistoryPointer; 
                            var newStr = dn.g_findHistory.get(dn.findHistoryPointer);
                            dn.$find_input.val(newStr);
                            dn.DoFind(newStr);
                            e.preventDefault();
                        }
                  })
                  .on("keyup",function(e){ //we need keyup here in order that the val has the new character or new backspace
                        if(e.which == WHICH.ENTER || e.which == WHICH.ESC || e.which == WHICH.UP || e.which == WHICH.DOWN)
                            return; 
                        if(dn.findingStr == dn.$find_input.val())
                            return;
                        if(dn.$find_input.val() != dn.findingStr)
                            dn.findHistoryPointer = NaN;
                        dn.DoFind(dn.$find_input.val())
                  })
    dn.$replace_input.focus(function(){
                        dn.CancelBlurFindAndFocusEditor();
                        if(!dn.showingFindResults)
                            dn.DoFind(dn.findingStr);
                            
                        //we want to force the find input to always be the next tab index
                        dn.$find_input.attr("tabindex",parseInt(dn.$replace_input.attr("tabindex"))+1); 
                        if(dn.find_resultMarkers.length)
                            dn.$findreplace_info.html("Found " + dn.find_resultMarkers.length + " occurances<br>" +
                             "Enter: replace current selection<br>Ctrl+Enter: replace all<br>Esc: hide the find/replace box<br>Tab: focus on find field");
                        else
                            dn.$findreplace_info.html("Nothing to replace.<br>Esc: hide the find/replace box<br>Tab: focus on find field");
                    })
                    .on("keydown",function(e){ //we want keydown here so that we can get repeated firing whith keydown (i think on most browsers)
                        if(e.which == WHICH.ENTER){
                            if(!dn.find_resultMarkers.length)
                                return;
                            var n = e.ctrlKey ? dn.find_resultMarkers.length : 1;
                            if(e.ctrlKey)
                                dn.editor.replaceAll(dn.$replace_input.val());
                            else
                                dn.editor.replace(dn.$replace_input.val());
                            if(e.shiftKey)
                                dn.editor.findPrevious()
                            else
                                dn.editor.findNext();
                            dn.DoFind(dn.findingStr); 
                            if(dn.find_resultMarkers.length)
                                dn.$findreplace_info.html ("Replaced " + n + " occurence" + (n>1? "s" : "") + ". <br>" +  dn.find_resultMarkers.length + " occurances remain<br>" +
                                 "Enter: replace current selection<br>Ctrl+Enter: replace all<br>Esc: hide the find/replace box<br>Tab: focus on find field");
                            else
                                dn.$findreplace_info.html("Replaced " + (n>1 ? "all " + n + " occurences" : "the 1 occurance") +". <br> Nothing further to replace.<br>Esc: hide the find/replace box<br>Tab: focus on find field");
                        }
                        if(e.which == WHICH.ESC){
                            dn.BlurFindAndFocusEditor(); 
                            //the normal togglewidget shortcut will kick in
                        }
                    })
                  .blur(function(){
                      dn.BlurFindAndFocusEditor("delay");
                  });
                  
}

dn.ShowFind = function(){
    dn.showingReplace = false;
    dn.$replace_form.hide();
    var sel = dn.editor.session.getTextRange(dn.editor.getSelectionRange());
    dn.$widget_findreplace.show();
    if(sel)
        dn.$find_input.val(sel)
    dn.$find_input.focus();
    if(!sel)
        dn.$find_input.select();
    dn.findHistoryPointer = NaN;
    return false;
}

dn.ShowReplace = function(){
    dn.showingReplace = true;
    dn.$replace_form.show();
    var sel = dn.editor.session.getTextRange(dn.editor.getSelectionRange());
    dn.$widget_findreplace.show();
    if(sel)
        dn.$find_input.val(sel)
    dn.$find_input.focus()
    if(!sel)
        dn.$find_input.select();
    return false;
}


// ############################
// Goto line stuff
// ############################

dn.CreateGotoLine = function(){
    var $d = $("<div class='widget_box widget_goto'>Go to: <input class='gotoline_input' placeholder='line number'></input><br>Esc: hide the goto line box</div>");
    dn.$widget_goto = $d;
    dn.$goto_input = $d.find('input');
    dn.$goto_input.blur(dn.ReclaimFocus)
                  .keyup(function(e){
                      if(e.which == WHICH.ENTER || e.which == WHICH.ESC){
                        if(e.which == WHICH.ENTER) //if it's esc the normal ToggleWidget shortcut will kick in.
                            dn.$widget_goto.toggle(false);
                        dn.ReclaimFocus();
                        return;
                      }
                      var val = $(this).val();
                      if(val){
                        var line = parseInt(val,10);
                        if(!isNaN(line))
                            dn.editor.gotoLine(line,0,true);
                      }
                  });
                  
    dn.$widget_menu.after($d.hide());
}

dn.ShowGoTo = function(){
    dn.$widget_goto.show();
    dn.$goto_input.focus()
                  .select();
    return false;
}

// ############################
// Widget stuff
// ############################

    
dn.CreateMenu = function(){
    
    var $d = $("<div/>").append($([
    
    "<div class='widget_menu_icon' data-info='save' id='menu_save'></div>" ,
    "<div class='widget_menu_icon' data-info='print' id='menu_print'></div>",
    "<div class='widget_menu_icon' data-info='sharing' id='menu_sharing'></div>",
    "<div class='widget_menu_icon' data-info='file history' id='menu_history'></div>" ,
    "<div class='widget_menu_icon' data-info='new' id='menu_new'></div>",
    "<div class='widget_menu_icon' data-info='open' id='menu_open'></div>",    
    "<div class='widget_menu_icon' data-info='shortcuts'id='menu_shortcuts'></div>",
    "<a class='widget_menu_icon' data-info='drive' id='menu_drive'  href='' target='_blank'></a>",    
    "<a class='widget_menu_icon' data-info='about' id='menu_about'  href='http://drivenotepad.appspot.com/support' target='_blank'></a>", 
    
    "<div class='widget_spacer'></div>",
    "<div class='widget_spacer'></div>",
    
   "<div class='widget_subs'>",
        "<div class='widget_subs_titles'>",
            "&nbsp;&nbsp;&nbsp;",
            "<div class='widget_sub_title tooltip' selected=1 id='sub_file_title' data-info='settings_file'>This File</div>",
            "<div class='widget_sub_title tooltip' id='sub_general_title' data-info='settings_general'>General</div>",
        "</div>",
        
       "<div class='widget_sub_box' selected=1 id='sub_file_box'>",
            "<div class='widget_menu_item details_file_title' clickable=1>" ,
                "<div class='details_file_title_text tooltip' data-info='title'></div>" ,
                "<input type='text' placeholder='title' class='details_file_title_input' style='display:none;'/>" ,
            "</div>" ,
    
            "<div class='widget_menu_item details_file_description' clickable=1>",
                "<div class='details_file_description_text tooltip' data-info='description'></div>",
                "<textarea placeholder='description' class='details_file_description_input' style='display:none;'></textarea>",
            "</div>",
           
            "<div class='widget_spacer'></div>",
           
           "<div class='widget_menu_item details_file_aceMode'>Syntax: ",
                "<div class='inline_button' id='file_aceMode_detect'>detect</div>",
                "<div class='inline_button' id='file_aceMode_choose'></div>",
                "<div class='file_info' id='file_aceMode_info'></div>",  
            "</div>",
            "<div class='widget_spacer'></div>",
            "<div class='widget_menu_item details_file_newline'>Newline: ",
                "<div class='inline_button' id='file_newline_detect'>detect</div>",
                "<div class='inline_button' id='file_newline_windows'>windows</div>",
                "<div class='inline_button' id='file_newline_unix'>unix</div>",
                "<div class='file_info' id='file_newline_info'></div>",
            "</div>",
            "<div class='widget_spacer'></div>",
            "<div class='widget_menu_item details_file_tab'>Tabs: ",
                "<div class='inline_button' id='file_tab_detect'>detect</div>",
                "<div class='inline_button' id='file_tab_hard'>hard</div>",
                "<div class='inline_button' id='file_tab_soft'>",
                    "<div class='button_sub' id='file_tab_soft_text'>?? spaces</div>", 
                    "<div class='button_sub button_sub_unselectable' id='file_tab_soft_dec'>▼</div>",
                    "<div class='button_sub button_sub_unselectable' id='file_tab_soft_inc'>▲</div>",
                "</div>", 
                "<div class='file_info' id='file_tab_info'></div>",
            "</div>",
        "</div>",
        
        "<div class='widget_sub_box' id='sub_general_box'>",
                
            "<div class='widget_menu_item'>Recent changes: ",
                "<div class='inline_button' id='gutter_history_hide'>hide</div>",
                "<div class='inline_button' id='gutter_history_show'>show</div>",
            "</div>",
        
            "<div class='widget_menu_item'>Word wrap: ",
                "<div class='inline_button' id='word_wrap_off'>none</div>",
                "<div class='inline_button' id='word_wrap_at'>",
                    "<div class='button_sub' id='word_wrap_at_text'>at ??</div>",
                    "<div class='button_sub button_sub_unselectable' id='word_wrap_at_dec'>&#9660;</div>",
                    "<div class='button_sub button_sub_unselectable' id='word_wrap_at_inc'>&#9650;</div>",
                "</div>", 
                "<div class='inline_button' id='word_wrap_edge'>at edge</div>",
            "</div>",
                    
            "<div class='widget_menu_item'>Font size: ",
                "<div class='inline_button fontSizeDecrement'>&#9660;abc</div>", //TODO: make this a single button
                "<div class='inline_button fontSizeIncrement'>abc&#9650;</div>",
            "</div>",
                    
            "<div class='widget_menu_item'>Tab default: ",
                "<div class='inline_button' id='tab_hard'>hard</div>",
                "<div class='inline_button' id='tab_soft'>",
                        "<div class='button_sub' id='tab_soft_text'>?? spaces</div>", 
                        "<div class='button_sub button_sub_unselectable' id='tab_soft_dec'>&#9660;</div>",
                        "<div class='button_sub button_sub_unselectable' id='tab_soft_inc'>&#9650;</div>",
                "</div>",
            "</div>",
                    
            "<div class='widget_menu_item'>Newline default: ",
                "<div class='inline_button' id='newline_menu_windows'>windows</div>",
                "<div class='inline_button' id='newline_menu_unix'>unix</div>",
            "</div>",
            
            "<div class='widget_menu_item'>Clear history:&nbsp;",
                    "<div class='widget_menu_item' id='clipboard_history_clear_button' inline=1 clickable=1>clipboard</div>",
                    "<div class='widget_menu_item' id='find_history_clear_button' inline=1 clickable=1>find/replace</div>",
            "</div>",
            
        "</div>",
    "</div>",
    
    "<div class='widget_spacer'></div>",
    "<div id='menu_status'>...</div>"

    ].join('')));

    
    dn.$details_title_input  = $d.find('.details_file_title_input');
    dn.$details_title_text = $d.find('.details_file_title_text');
    
    dn.$menu_save = $d.find('#menu_save');
    dn.$menu_print = $d.find('#menu_print');
    dn.$menu_sharing = $d.find('#menu_sharing');
    dn.$menu_history = $d.find('#menu_history');
    
    dn.$widget_sub_file_title = $d.find('#sub_file_title')
    dn.$widget_sub_file_box = $d.find('#sub_file_box')

    dn.$details_description_input  = $d.find('.details_file_description_input');
    dn.$details_description_text = $d.find('.details_file_description_text');
    dn.syntaxDropDown = dn.CreateSyntaxMenu()
    
    dn.$file_aceMode_choose = $d.find('#file_aceMode_choose').append(dn.syntaxDropDown.$el);
    dn.$file_aceMode_detect = $d.find('#file_aceMode_detect');
    dn.$file_aceMode_info = $d.find('#file_aceMode_info');
    dn.$file_newline_detect = $d.find('#file_newline_detect');
    dn.$file_newline_windows = $d.find('#file_newline_windows');
    dn.$file_newline_unix = $d.find('#file_newline_unix');
    dn.$file_newline_info = $d.find('#file_newline_info');
    dn.$file_tab_detect = $d.find('#file_tab_detect');
    dn.$file_tab_hard = $d.find('#file_tab_hard');
    dn.$file_tab_soft = $d.find('#file_tab_soft');
    dn.$file_tab_soft_text = $d.find('#file_tab_soft_text');
    dn.$file_tab_info = $d.find('#file_tab_info');

    dn.$widget_sub_general_title = $d.find('#sub_general_title')
    dn.$widget_sub_general_box = $d.find('#sub_general_box')

    dn.$menu_clear_clipboard = $d.find("#clipboard_history_clear_button");
    dn.$menu_clear_find_history = $d.find("#find_history_clear_button");

    dn.$gutter_history_show = $d.find('#gutter_history_show');
    dn.$gutter_history_hide = $d.find('#gutter_history_hide');
    dn.$word_wrap_off = $d.find('#word_wrap_off');
    dn.$word_wrap_at = $d.find('#word_wrap_at');
    dn.$word_wrap_edge = $d.find('#word_wrap_edge');
    dn.$fontSizeDecrement = $d.find('.fontSizeDecrement')
    dn.$fontSizeIncrement = $d.find('.fontSizeIncrement')
    dn.$tab_hard = $d.find('#tab_hard');
    dn.$tab_soft = $d.find('#tab_soft');
    dn.$newline_menu_windows = $d.find('#newline_menu_windows');
    dn.$newline_menu_unix = $d.find('#newline_menu_unix');
     
    dn.$menu_shortcuts = $d.find('#menu_shortcuts');
    dn.$menu_new = $d.find('#menu_new');
    dn.$menu_open = $d.find('#menu_open');
    dn.$menu_status = $d.find('#menu_status');
    dn.$menu_drive = $d.find('#menu_drive');
    dn.$widget_menu.html("").prepend($d.children()); 
    dn.$widget_menu.find('.widget_menu_icon').on("click",function(){dn.ReclaimFocus();});
}

dn.CreateIconMouseOver = function(){
    dn.$widget_menu.find(".widget_menu_icon, .tooltip")
        .on("mouseenter",function(){
            var dataInfo = $(this).data('info');
            if(!(dataInfo && dataInfo in dn.TOOLTIP_INFO))
                return;
            var infoStr = dn.TOOLTIP_INFO[dataInfo]; 
            clearTimeout(dn.menu_status_timer || 0);
            dn.menu_status_timer = setTimeout(function(){
                dn.$menu_status.text(infoStr)
            },dn.ICON_MOUSEOVER_MS);
        })
        .on("mouseleave",function(){
            clearTimeout(dn.menu_status_timer || 0);
            dn.menu_status_timer = setTimeout(function(){
                dn.$menu_status.text(dn.menu_status_default);
            },dn.ICON_MOUSEOVER_MS);        
        });
}

dn.CreateMenuSubs = function(){
    dn.$widget_sub_general_title.click(function(){
        dn.g_settings.set("widgetSub","general");
        dn.ReclaimFocus();
    });
    dn.$widget_sub_file_title.click(function(){
        dn.g_settings.set("widgetSub","file");
        dn.ReclaimFocus();
    });
}
dn.WidgetMoveHandleMouseDown = function(e){
    var pos  = dn.$widget.position();
	dn.$widget.data('dragging', {
			off_left: /*pos.left*/-e.clientX ,
			off_top: /*pos.top*/-e.clientY});
	$(document).attr('dragging','true')
			   .on('mousemove', dn.DocumentMouseMove_Widget)
			   .on('mouseup',dn.DocumentMouseUp_Widget);
}

dn.DocumentMouseMove_Widget = function(e){
   var dragging = dn.$widget.data('dragging');
   var x = e.clientX+dragging.off_left;
   var y = e.clientY+dragging.off_top;
   dn.$widget.translate(x,y);
   e.stopPropagation();
};

dn.DocumentMouseUp_Widget = function(e){
	var pos = dn.$widget.position();
	dn.$widget.translate(0,0);
	//dn.$widget.css({left: pos.left + 'px',top: pos.top + 'px'})
	$(document).removeAttr('dragging')
			   .off('mousemove',dn.DocumentMouseMove_Widget)
			   .off('mouseup',dn.DocumentMouseUp_Widget);

	if(dn.g_settings){
		//work out what widget_anchor should be
		var widget_w = dn.$widget.width();
		var widget_h = dn.$widget.height();
		var window_w = $(window).width();
		var window_h = $(window).height();
		var anchor = []
		if(pos.left < window_w - (pos.left + widget_w)){
			anchor[0] = 'l'; //anchor left side by window width percentage
			anchor[1] = Math.max(0,pos.left/window_w * 100);
		}else{
			anchor[0] = 'r'; //anchor right side by window width percentage
			anchor[1] = Math.max(0,(window_w - (pos.left + widget_w))/window_w * 100);
		}
		if(pos.top < window_h - (pos.top+ widget_h)){
			anchor[2] = 't'; //anchor top side by window height percentage
			anchor[3] = Math.max(0,pos.top/window_h * 100);
		}else{
			anchor[2] = 'b'; //anchor bottom side by window height percentage
			anchor[3] = Math.max(0,(window_h - (pos.top + widget_h))/window_h * 100);
		}

		dn.g_settings.set("widget_anchor",anchor); 
	}
};

dn.WidgetApplyAnchor = function(anchor){
	anchor = $.isArray(anchor) ? anchor : dn.g_settings.get('widget_anchor');
	var widget_w = dn.$widget.width();
	var widget_h = dn.$widget.height();
	var window_w = $(window).width();
	var window_h = $(window).height();

	if(anchor[0] == 'l'){
		// horizontal position is anchored to a fixed percentage of window width on left of widget
		if(window_w * anchor[1]/100 + widget_w > window_w)
			dn.$widget.css({left: 'inherit',right: '0px'}); //if the widget would overlap the right edge, then instead put it precisely on the right edge
		else
			dn.$widget.css({left: anchor[1] + '%', right: ''}); //use the anchor exactly
	}else{
		// horizontal position is anchored to a fixed percentage of window width on right of widget
		if( window_w * anchor[1]/100 + widget_w > window_w)
			dn.$widget.css({left: '0px',right: ''}); //if the widget would overlap the left edge, then instead put it precisely on the left edge
		else
			dn.$widget.css({left: 'inherit', right: anchor[1] + '%'}); //use the anchor exactly
	}

	if(anchor[2] == 't'){
		// vertical position is anchored to a fixed percentage of window height on top of widget
		if(window_h * anchor[3]/100 + widget_h > window_h)
			dn.$widget.css({top: 'inherit',bottom: '0px'});  
		else
			dn.$widget.css({top: anchor[3] + '%', bottom: ''}); 
	}else{
		// vertical position is anchored to a fixed percentage of window height on bottom of widget
		if(window_h * anchor[3]/100 + widget_h > window_h)
			dn.$widget.css({top: '0px',bottom: ''}); 
		else
			dn.$widget.css({top: 'inherit', bottom: anchor[3] + '%'}); 
	}



}

dn.ToggleWidget = function(state){
    if(dn.ignoreEscape){
        dn.ignoreEscape = false;
        return;
    }
    var $subs_ = [  dn.$widget_menu,
                    dn.$widget_shortcuts,
                    dn.$widget_syntax,
                    dn.$widget_clipboard,
                    dn.$opener_chooser,
                    dn.$widget_goto,
                    dn.$widget_findreplace,
                    dn.$widget_fileHistory];
	var wasShowing = [];
	for(var i=0;i<$subs_.length;i++)
		if($subs_[i] && $subs_[i].css('display') != 'none')
			wasShowing.push($subs_[i].toggle(state)); //if state is true then leav $elshowing, othewise hide it

	if(wasShowing.length === 0 && !((typeof state === "number" || typeof state === "boolean") && !state)) 
		dn.$widget_menu.show();
        
    if(dn.isShowingHistory)
        dn.CloseHistory();
    
    dn.ReclaimFocus();
    return false;
}

dn.ShowStatus = function(){
    //TODO: show "updating file details" for custom properties
    
    var f = dn.theFile;
    var s = '';
    if(f.isReadingFileObject)
        s = "Reading file from disk:\n" + f.title;
    else if(f.isLoadingMetaData)
        s = "Loading info for file:\n" + f.fileId;
    else if(f.isLoadingContent)
        s = "Downloading file:\n" + f.title
    else if(f.contentIsLoaded && f.isPristine && !f.isSaving)
        s = "Displaying " + (f.isShared ? "shared " : "") + (f.isReadOnly ? "read-only " : "") + "file:\n" + f.title;
    else if((f.contentIsLoaded || f.isBrandNew) && !f.isPristine && !f.isSaving)
        s = "Unsaved " + (f.isBrandNew ? "new " : "changes for ") + (f.isShared ? "shared " : "") + (f.isReadOnly ? "read-only " : "") + "file:\n" + f.title;
    else if((f.contentIsLoaded || f.isBrandNew) && f.isPristine && f.isSaving)
        s = "Saving " + (f.isShared ? "shared " : "") + (f.isReadOnly ? "read-only " : "") + "file:\n" + f.title + (!f.isBrandNew && (f.dataToSave.title || f.dataToSave.description) ? "\n(updating file details)" : "");
    else if(f.isBrandNew && f.isPristine)
        s = "ex nihilo omnia.";
    else
        s = f.title ? "Failed to load file:\n" + f.title : "ex nihilo omnia";

     if(dn.isGettingToken || !(gapi && gapi.client && gapi.client.drive))
        s += "\nAuthenticating...";

    dn.$widget_text.textMulti(s,true);
}

dn.ShowError = function(message){
    console.log(message); //it's just useful to do this too
	dn.$widget_error_text.textMulti(message,true);
	dn.$widget_error.show();
	dn.$widget.cssAnimation('shake',function(){dn.$widget_error.hide();},dn.ERROR_DELAY_MS);
};

dn.SetDriveLinkToFolder = function(){
    var a = dn.$menu_drive;
    if(a && dn.theFile.folderId)
        a.attr('href','https://drive.google.com/#folders/' + dn.theFile.folderId);
    else
        a.attr('href','https://drive.google.com');
}


// ############################
// Settings stuff
// ############################

dn.GetSettingsFromCloud = function() {
  gapi.drive.realtime.loadAppDataDocument(
  function(doc) {
    var oldTempG_settings = dn.g_settings;
    dn.g_settings = doc.getModel().getRoot();
    dn.g_clipboard = dn.g_settings.get('clipboard');
    if(!dn.g_clipboard){
        dn.g_settings.set('clipboard', doc.getModel().createList());
        dn.g_clipboard = dn.g_settings.get('clipboard');
    }
    dn.g_findHistory = dn.g_settings.get('findHistory');
    if(!dn.g_findHistory){
        dn.g_settings.set('findHistory', doc.getModel().createList());
        dn.g_findHistory = dn.g_settings.get('findHistory');
    }
    
	var existingKeys = dn.g_settings.keys();
	dn.g_settings.addEventListener(gapi.drive.realtime.EventType.VALUE_CHANGED, dn.SettingsChanged);
	for(var s in dn.DEFAULT_SETTINGS)
		if(s in oldTempG_settings.getKeeps())
            dn.g_settings.set(s,oldTempG_settings.get(s));
		else if(existingKeys.indexOf(s) == -1)
    		dn.g_settings.set(s,dn.DEFAULT_SETTINGS[s]);
        else if(JSON.stringify(oldTempG_settings.get(s)) !== JSON.stringify(dn.g_settings.get(s)))
			dn.SettingsChanged({property:s, newValue:dn.g_settings.get(s)});// the gapi doesn't automatically trigger this on load
    
    //Check lastDNVersionUsed at this point - by default it's blank, but could also have an out-of-date value
    if(dn.g_settings.get('lastDNVersionUsed') == "2014a")
        dn.Show2014bUserInfo();
    else if(dn.g_settings.get('lastDNVersionUsed') != dn.VERSION_STR)
        dn.ShowFirstTimeUserInfo();
    dn.g_settings.set('lastDNVersionUsed',dn.VERSION_STR);
  },
  null,
  function(resp){
		console.log("g_settings error");
		console.dir(arguments);
		if ((resp.type && resp.type == "token_refresh_required") || resp.error.code == 401) //not sure if it has an error.code field but it does seem to have a type field
		  	dn.Reauth(function(){console.log("reauthed triggered by g_settings")}); //no real callback here, I think the realtime api somehow disovers that we're back in buisiness
	})

}

dn.LoadDefaultSettings = function(){
  //Lets show the user either the defualt settings or the 
  //ones last used on this browser (restricted to impersonal settings only)

  dn.g_settings = (function(){ //mock realtime model to be used until the real model is initialised
	  var ob = {};
      var keeps = {}
      return {get: function(k){return ob[k]}, 
              set: function(k,v){ob[k] = v;
                                 dn.SettingsChanged({property: k, newValue: v});
                                 },
              keep: function(k){keeps[k] = true},
              getKeeps: function(){return keeps;}};
                                 
  })();
  try{
    for(var s in dn.DEFAULT_SETTINGS)
    if(dn.IMPERSONAL_SETTINGS_KEYS.indexOf(s) == -1 || !localStorage || !localStorage["g_settings_" +s])
        dn.g_settings.set(s,dn.DEFAULT_SETTINGS[s]);
    else
        dn.g_settings.set(s,JSON.parse(localStorage["g_settings_" + s]));
  }catch(err){
      if(localStorage) 
        localStorage.clear();
      console.log("Failed to load defaults/localStorage settings.  Have cleared localStorage cache.")
  }
}

dn.SettingsChanged = function(e){
	console.log("[user settings] " + e.property +": " + e.newValue);
	if(dn.IMPERSONAL_SETTINGS_KEYS.indexOf(e.property)>-1 && localStorage){
        localStorage["g_settings_" + e.property] = JSON.stringify(e.newValue);
	}
    try{
		switch(e.property){
			case "widget_anchor":
				if(!dn.$widget.attr('dragging')){
					dn.WidgetApplyAnchor(e.newValue);
				}
				break;
			case "fontSize":
                var scrollLine = dn.GetScrollLine();
				dn.editor.setFontSize(e.newValue + 'em')	
                dn.editor.scrollToLine(scrollLine);
				break;
			case "wordWrap":
				var s = dn.editor.getSession();
                var scrollLine = dn.GetScrollLine();
				s.setUseWrapMode(e.newValue[0]);
				s.setWrapLimitRange(e.newValue[1],e.newValue[2]);
                 dn.editor.scrollToLine(scrollLine);
                if(!e.newValue[0])
                    dn.$word_wrap_off.attr('selected',true);
                else
                    dn.$word_wrap_off.removeAttr('selected');
                if(e.newValue[0] && !e.newValue[1])
                    dn.$word_wrap_edge.attr('selected',true);
                else
                    dn.$word_wrap_edge.removeAttr('selected');
                if(e.newValue[0] && e.newValue[1])
                    dn.$word_wrap_at.attr('selected',true);
                else
                    dn.$word_wrap_at.removeAttr('selected');

				break;
            case "wordWrapAt":
                dn.$word_wrap_at_text.text("at " + e.newValue);
                var curWrap = dn.g_settings.get('wordWrap');
                if(curWrap[1] && curWrap[1] != e.newValue)
                    dn.g_settings.set('wordWrap',[1,e.newValue,e.newValue]);
                dn.editor.setPrintMarginColumn(e.newValue);
                break;
            case "showGutterHistory":
                var s = dn.editor.getSession(); 
                if(e.newValue){
                    dn.$gutter_history_show.attr('selected',true)
                    dn.$gutter_history_hide.removeAttr('selected');
                }else{
                    var h = dn.changeLineHistory;
                    for(var i=0;i<h.length;i++)if(h[i])
                        s.removeGutterDecoration(i,h[i]<0 ? dn.CHANGE_LINE_CLASSES_RM[-h[i]] : dn.CHANGE_LINE_CLASSES[h[i]]);
                    dn.changeLineHistory = []; 
                    dn.$gutter_history_hide.attr('selected',true)
                    dn.$gutter_history_show.removeAttr('selected');
                }
                break;
            case "newLineDefault":
                dn.ApplyNewlineChoice();
                break;
            case "historyRemovedIsExpanded":
                dn.RevisionSetIsExpaned(e.newValue);
                break;
            case "softTabN":
            case "tabIsHard":          
                dn.ApplyTabChoice(); 
                break;
            case "widgetSub":
                if(e.newValue === "general"){
                    dn.$widget_sub_general_box.attr("selected",1);
                    dn.$widget_sub_file_box.removeAttr("selected");
                    dn.$widget_sub_general_title.attr("selected",1);
                    dn.$widget_sub_file_title.removeAttr("selected");
                }else{//file
                    dn.$widget_sub_file_box.attr("selected",1);
                    dn.$widget_sub_general_box.removeAttr("selected");
                    dn.$widget_sub_file_title.attr("selected",1);
                    dn.$widget_sub_general_title.removeAttr("selected");
                }
                break;
		}
	}catch(err){
		console.log("Error while uptating new settings value.")
		console.dir(e);
		console.dir(err);
	}
}


// ############################
// Keyboard shortcuts stuff
// ############################

dn.platform = (function(){
    if(navigator.platform.indexOf("Win") >-1)
		return "Windows";
	else if(navigator.platform.indexOf("Linux") >-1)
		return "Linux";
	else if(navigator.platform.indexOf("Mac")>-1)
		return "Mac";
        
    return null;
})();

dn.CreateShortcutsInfo = function(){
//This is hardly the world's most efficient way of doing this....(but it probably doesn't matter)...

	var arry = dn.SHORTCUTS_LIST;
	var dict = {};
	var platform = dn.platform;

	if(platform == "Windows" || platform == "Linux"){
	   for(var i=0;i<arry.length;i++){
			var parts = arry[i].split("|");
			if(parts[1].length)
				dict[parts[0]] = parts[1];
		}
	}else if(platform == "Mac"){
		for(var i=0;i<arry.length;i++){
			var parts = arry[i].split("|");
			if(parts[1].length)
				dict[parts[0]] = parts.length > 2? parts[2] : parts[1];
		}
	}else{
		//TODO: show something here, maybe let user switch, maybe have touch info for ipad & android.
	}
    
	var $d = dn.$widget_shortcuts = $("<div class='widget_box' id='widget_shortcuts'/>");
	var $title = $("<div class='widget_box_title shortcuts_title'>Keyboard Shortcuts " + 
					(platform ? "(" + platform + ")" : "" )+
					"</div>");
                    
    dn.$menu_shortcuts.click(
			function(){
				dn.$widget_shortcuts.toggle(true);
				dn.$widget_menu.hide();
			});
	$d.append($title);
	$d.append($("<div class='shortcuts_header_action'>action</div><div class='shortcuts_header_key'>key</div>"))
	var $list = $("<div class='shortcuts_list'></div>");
	$d.append($list);

	for(var action in dict)
		$list.append($("<div class='shortcut_item'><div class='shortcut_action'>" + action + "</div><div class='shortcut_key'>" + dict[action].replace(",","<br>") + "</div></div>"));
	dn.$widget_menu.after($d.hide());
    
    for(var action in dn.TOOLTIP_INFO)if(action in dict)
        dn.TOOLTIP_INFO[action] +=  dict[action];
    
};

dn.MakeKeyboardShortcuts = function(){
    //perviously was using ace for handling these shorcuts because it neater (and efficient?) but it was
    //annoying trying to ensure the editor always had focus, and not clear what to do when the editor wasn't showing.
    
    //we have to delete the default ace commands linked to the keys we care about
    dn.editor.commands.removeCommands(["find","findprevious","findnext","replace", "jumptomatching","sortlines","selecttomatching","gotoline"]);

    //then add new commands on to the $(document) using keymaster.js...
    key('command+s, ctrl+s,  ctrl+alt+s,  command+alt+s', dn.SaveContent);
    key('command+p, ctrl+p,  ctrl+alt+p,  command+alt+p', dn.DoPrint);
    key('command+o, ctrl+o,  ctrl+alt+o,  command+alt+o', dn.DoOpen);
    key('command+n, ctrl+n,  ctrl+alt+n,  command+alt+n', dn.DoNew);
    key('command+l, ctrl+l,  ctrl+alt+l,  command+alt+l', dn.ShowGoTo);
    key('command+f, ctrl+f,  ctrl+alt+f,  command+alt+f', dn.ShowFind);
    key('command+r, ctrl+r,  ctrl+alt+r,  command+alt+r' + 
       ', command+g, ctrl+g,  ctrl+alt+g,  command+alt+g', dn.ShowReplace);
    key('command+h, ctrl+h,  ctrl+alt+h,  command+alt+h', dn.StartRevisionsWorker);
    key('esc',dn.ToggleWidget);    
    key.filter = function(){return 1;}


    // it seems like the clipboard history cycling only works the old way, i.e. using ace....
    var HashHandler = require("ace/keyboard/hash_handler").HashHandler
    var extraKeyEvents = new HashHandler([
        {bindKey: {win: "Ctrl-Left",mac: "Command-Left"}, descr: "Clipboard cyle back on paste", exec: dn.Document_ClipboardLeft},
        {bindKey: {win: "Ctrl-Down",mac: "Command-Down"}, descr: "Clipboard cyle back on paste", exec: dn.Document_ClipboardLeft},
        {bindKey: {win: "Ctrl-Right",mac:"Command-Right"}, descr: "Clipboard cyle forward on paste", exec: dn.Document_ClipboardRight},
        {bindKey: {win: "Ctrl-Up",mac:"Command-Up"}, descr: "Clipboard cyle forward on paste", exec: dn.Document_ClipboardRight}
	]);
	dn.editor.keyBinding.addKeyboardHandler(extraKeyEvents);
}


dn.ReclaimFocus = function(){
    dn.editor.focus(); //this was much more complciated previously when the non-ace shortcuts went through the editor rather than through the document
}

// ############################
// Font size stuff
// ############################

dn.CreateFontSizeTool = function(){
	dn.$fontSizeDecrement.click(function(){
		var fontSize = dn.g_settings.get('fontSize');
		fontSize -= dn.FONT_SIZE_INCREMENT;
		fontSize = fontSize  < dn.MIN_FONT_SIZE ? dn.MIN_FONT_SIZE:fontSize;
		dn.g_settings.set('fontSize',fontSize);
	})
    dn.$fontSizeIncrement.click(function(){
		var fontSize = dn.g_settings.get('fontSize');
		fontSize += dn.FONT_SIZE_INCREMENT;
		fontSize = fontSize  > dn.MAX_FONT_SIZE ? dn.MAX_FONT_SIZE:fontSize;
		dn.g_settings.set('fontSize',fontSize);
	})
}


// ############################
// Word wrap stuff
// ############################

dn.CreateWordWrapTool = function(){
	dn.$word_wrap_off.click(function(){dn.g_settings.set('wordWrap',[0,0,0])});
	dn.$word_wrap_at.click(function(){
        var at = dn.g_settings.get('wordWrapAt');
        dn.g_settings.set('wordWrap',[1,at,at]);
        });
    dn.$word_wrap_at_text = dn.$word_wrap_at.find('#word_wrap_at_text');
    dn.$word_wrap_at.find('#word_wrap_at_dec').click(function(){
        var at = dn.g_settings.get('wordWrapAt') - dn.WRAP_AT_INCREMENT;
        at = at < dn.MIN_WRAP_AT ? dn.MIN_WRAP_AT : at;
        dn.g_settings.set('wordWrapAt',at);
        });
    dn.$word_wrap_at.find('#word_wrap_at_inc').click(function(){
        var at = dn.g_settings.get('wordWrapAt') + dn.WRAP_AT_INCREMENT;
        at = at > dn.MAX_WRAP_AT ? dn.MAX_WRAP_AT : at;
        dn.g_settings.set('wordWrapAt',at);
        });
    
	dn.$word_wrap_edge.click(function(){dn.g_settings.set('wordWrap',[1,null,null])});
}

// ############################
// Tab stuff
// ############################
// Note that there is a whitespace extension for ace but it doesn't look that mature and we actually have slightly different requirements here.

dn.CreateTabTool = function(){
    dn.$tab_soft_text = dn.$tab_soft.find('#tab_soft_text');

    dn.$tab_hard.click(function(){
        dn.g_settings.set('tabIsHard',1)
        });
	dn.$tab_soft.click(function(){
        dn.g_settings.set('tabIsHard',0);
        });
    dn.$tab_soft.find('#tab_soft_dec').click(function(){
        var at = dn.g_settings.get('softTabN') - 1;
        at = at < dn.MIN_SOFT_TAB_N ? dn.MIN_SOFT_TAB_N : at;
        dn.g_settings.set('softTabN',at);
        });
    dn.$tab_soft.find('#tab_soft_inc').click(function(){
        var at = dn.g_settings.get('softTabN') + 1;
        at = at > dn.MAX_SOFT_TAB_N ? dn.MAX_SOFT_TAB_N : at;
        dn.g_settings.set('softTabN',at);
        });
}

dn.DetectTab = function(str){    
    dn.theFile.tabDetected = (function(){ //no need to use a self-executing function here, just lazy coding....
        //This function returns an object with a field "val" that takes one of the folling values:
        // none: no indents detected at all
        // mixture: no strong bias in favour of spaces or tabs
        // tab: defintely tabs
        // spaces: definitely space. In this case extra fields are provied....
        //   n: number of spaces
        //   isDefault: true if the default nSpaces value was used as part of the decision making process
        //   threshold: this takes one of three values:
        //          strong: the largest n over threshold was used
        //          weak: no n was over the strong threshold, but the default n was over the weak threshold
        //          failed: no idea what n is, so just use default
    
        var lines = dn.editor.session.getLines(0, 1000);    
        var indents = lines.map(function(str){
                        return str.match(/^\s*/)[0];
                      });
        indents = indents.filter(function(str){return str !== '';});
        
        if(!indents.length)
            return dn.ShowTabStatus({val: "none"});
            
        //TODO: if first thousand lines happen to have few indents it may be worth checking further down.
        
        var stats = indents.reduce(function(stats,str){
           if(str.indexOf('\t') > -1)
              if(str.indexOf(' ') > -1)
                stats.nWithMixture++;
              else
                stats.nWithOnlyTabs++;
           else
               stats.spaceHist[str.length] = (stats.spaceHist[str.length] || 0) + 1;   
            return stats;
        },{nWithOnlyTabs: 0,spaceHist: [],nWithMixture: 0});
            
        stats.nSamp = indents.length;
        stats.nWithOnlySpaces = stats.nSamp - stats.nWithMixture - stats.nWithOnlyTabs;
        
        console.dir(stats);
            
        if(stats.nWithOnlyTabs/stats.nSamp >= dn.DETECT_TABS_TABS_FRAC)
            return dn.ShowTabStatus({val: "tab"});
    
        if(stats.nWithOnlySpaces/stats.nSamp < dn.DETECT_TABS_SPACES_FRAC)
            return dn.ShowTabStatus({val: "mixture"});
    
        stats.spaceModHist = [];
        var s;
        for(s=dn.MIN_SOFT_TAB_N;s<=dn.MAX_SOFT_TAB_N;s++){
            var m = 0;    
            for(var i=s;i<stats.spaceHist.length;i+=s)
                m += stats.spaceHist[i] !== undefined ? stats.spaceHist[i] : 0;
            stats.spaceModHist[s] = m;
        }
        
        for(s=dn.MAX_SOFT_TAB_N;s>=dn.MIN_SOFT_TAB_N;s--)
            if(stats.spaceModHist[s]/stats.nWithOnlySpaces > dn.DETECT_TABS_N_SPACES_FRAC)
                break;
                
        if(s < dn.MIN_SOFT_TAB_N){
            // nothing was over threshold, but rather than give up lets use a weaker threshold on the default space count
            var defaultNSpaces = dn.g_settings.get('softTabN');    
            if(stats.spaceModHist[defaultNSpaces]/stats.nWithOnlySpaces > dn.DETECT_TABS_N_SPACES_FRAC_FOR_DEFAULT)
                return dn.ShowTabStatus({val: 'spaces', n: defaultNSpaces, isDefault: true, threshold: "weak"});
            else
                return dn.ShowTabStatus({val: "spaces", n: defaultNSpaces, isDefault: true, threshold: "failed"});
        }else{
            // s is the index of the last element in the spaceModHist array which is over threshold
                return dn.ShowTabStatus({val: "spaces", n: s, isDefault: false, threshold: "strong"});
        }
    })();
}


dn.ShowTabStatus = function(d){
    var str;
    var defaultStr = "";
    if(dn.g_settings.get("tabIsHard"))
        defaultStr = "hard tabs";
    else
        defaultStr = dn.g_settings.get("softTabN") + " spaces";
    
    switch(d.val){
        case 'none':
            str = "no indentations detected, default is " + defaultStr;
            break;
        case 'mixture':
            str = "detected mixture of tabs, default is " + defaultStr;
            break;
        case 'tab':
            str = "hard tab indentation detected";
            break;
        case "spaces":
            switch(d.threshold){
                case 'strong':
                    str = "detected soft-tabs of " + d.n + " spaces";
                    break;
                case 'weak':
                    str = "detected soft-tabs roughly matching default " + d.n + " spaces";
                    break;
                case 'failed':
                    str = "detected soft-tabs, assuming default " + d.n + " spaces";
                    break;
            }
    }
    
    dn.$file_tab_info.text("(" + str +")");
    return d;
}

dn.ApplyTabChoice = function(){
    var defaultTabIsHard = dn.g_settings.get('tabIsHard');
    var defaultSoftTabN = dn.g_settings.get('softTabN');               
                
    var d;
    var isHard;
    var nSpaces;
    var isDetected;
    
    dn.DetectTab();   
    if(dn.theFile.customProps.tabs == "detect"){
        d = dn.theFile.tabDetected;             
        isDetected = true
    }else{
        try{
            d = JSON.parse(dn.theFile.customProps.tabs);
        }catch(err){
            d = {val: "none"};
        }
    }
    switch(d.val){
        case 'none':
        case 'mixture':
            isHard = defaultTabIsHard;
            nSpaces = defaultSoftTabN;
            break;
        case 'tab':
            isHard = true;
            nSpaces = d.n || defaultSoftTabN;
            break;
        case 'spaces':
            isHard = false;
            nSpaces = d.n;
    }
    
    
    if(isHard){
        dn.editor.session.setUseSoftTabs(false);
    }else{
        dn.editor.session.setUseSoftTabs(true);
        dn.editor.session.setTabSize(nSpaces);
    }
    
    dn.$tab_soft_text.text(defaultSoftTabN + " spaces");
    if(defaultTabIsHard){
        dn.$tab_hard.attr('selected',true);
        dn.$tab_soft.removeAttr('selected');
    }else{
        dn.$tab_soft.attr('selected',true);
        dn.$tab_hard.removeAttr('selected');
    }
    
    
    dn.$file_tab_detect.removeAttr("selected");
    dn.$file_tab_hard.removeAttr("selected");
    dn.$file_tab_soft.removeAttr("selected");
    if(isDetected){
        dn.$file_tab_detect.attr("selected",true);
        dn.$file_tab_soft_text.text(nSpaces+ " spaces");
    }else{
        if(d.val == "tab")
            dn.$file_tab_hard.attr("selected",true);
        else
            dn.$file_tab_soft.attr("selected",true);
        dn.$file_tab_soft_text.text(nSpaces + " spaces");
    }     


}

dn.SetFileTabsToSoftOrHard = function(val,delta){
    var f = dn.theFile;
    var current = f.customProps.tabs;
    if(current == "detect"){
        current = f.tabDetected;
        if(current.val == 'none' || current.val == "mixture")
            current = { val: dn.g_settings.get('tabIsHard') ? "tab" : "spaces",
                        n: dn.g_settings.get('softTabN')};
    }else{
        try{
            current = JSON.parse(current);
        }catch(err){
            console.log("JSON.parse failed in SetFileTabsToSoftOrHard with current=" + current)
            return;
        }
    }
    var newT = {val: val, n: current.n + delta};
    dn.SetProperty("tabs",JSON.stringify(newT));
}
// ############################
// Syntax stuff
// ############################

dn.ShowSyntaxStatus = function(d){
    var str = "detected " + d.syntax + " from file extension";
    //TODO: if we improve upon DetectSyntax will need to add stuff here
    dn.$file_aceMode_info.text("(" + str + ")");
    return d.syntax;
}
dn.DetectSyntax = function(){
    dn.theFile.syntaxDetected = (function(){ //no need to use self-ex-func here, just laziness...
        //TODO: improve upon this
        var title = dn.theFile.title || "untitled.txt";
        var mode  = require("ace/ext/modelist").getModeForPath(title)
        dn.theFile.syntaxDetected = mode.caption;
        dn.ShowSyntaxStatus({syntax: dn.theFile.syntaxDetected});
        return mode;
    })();
}

dn.ApplySyntaxChoice = function(){
    dn.DetectSyntax();
    if(dn.theFile.customProps["aceMode"] == "detect"){
        dn.SetSyntax(dn.theFile.syntaxDetected);
        dn.$file_aceMode_detect.attr("selected",true);
        dn.syntaxDropDown.SetSelected(false);
    }else{
        dn.SetSyntax(dn.theFile.customProps["aceMode"])
        dn.$file_aceMode_detect.removeAttr("selected");
        dn.syntaxDropDown.SetSelected(true);
    }
}

dn.GetCurrentSyntaxName = function(){
    try{
        var modesArray = require("ace/ext/modelist").modesByName;
        return modesArray[dn.editor.session.getMode().$id.split('/').pop()].caption
    }catch(e){
        console.log("ERROR in GetCurrentSyntaxName...");
        console.dir(e);
        return "Text";
    }  
}

dn.SetSyntax = function(val){

	var modesArray = require("ace/ext/modelist").modes;
    var mode;
    var ind;
    
	if(typeof val == "number"){
		//val is index into mdoes array
        mode = modesArray[val].mode;
        ind = val;
	}else if(modesArray.indexOf(val) > -1){
		//val is an element of the modelist array
        mode = val.mode;
		ind = modesArray.indexOf(val);
	}else{
        //val is caption of mode in modes array
        for(ind=0;ind<modesArray.length;ind++)if(modesArray[ind].caption == val){
            mode = modesArray[ind].mode;
            break;
        }    
	}
    
    if(dn.syntaxDropDown)
        dn.syntaxDropDown.SetInd(ind,true);
    dn.editor.getSession().setMode(mode);
}

dn.CreateSyntaxMenu = function(){
	var modes = require("ace/ext/modelist").modes;
    
    var syntaxDropDown = new DropDown(modes.map(function(m){return m.caption;}));
    
    syntaxDropDown.on("click",dn.ReadOnlyBail);
    
    syntaxDropDown.on("click",function(){
        dn.SetProperty("aceMode",syntaxDropDown.GetVal());
    })
    syntaxDropDown.on("change",function(){
        dn.SetProperty("aceMode",syntaxDropDown.GetVal());
    })
    syntaxDropDown.on("blur",function(){
        dn.ReclaimFocus();
    })
    return syntaxDropDown;
}

// ############################
// File details stuff
// ############################
dn.ReadOnlyBail = function(e){
    if(dn.theFile.isReadOnly){
        dn.ShowError("The file is read-only, so you cannot change its properties.");
        e.stopImmediatePropagation();
        dn.ReclaimFocus();
    }
}
dn.CreateFileDetailsTool = function(){

    dn.$details_title_text.add(dn.$details_description_text).add(dn.$file_newline_detect).add(dn.$file_newline_windows)
        .add(dn.$file_newline_unix).add(dn.$file_tab_detect).add(dn.$file_tab_soft).add(dn.$file_tab_hard)
        .add(dn.$file_aceMode_detect) 
        .on("click",dn.ReadOnlyBail); //If file is read only, ReadOnlyBail will prevent the click handlers below from running.
        
    //Title change stuff
    dn.$details_title_text.click(function(){                
            dn.$details_title_text.hide();
            dn.$details_title_input.show();
            dn.$details_title_input.focus()
                                   .select();
        });
    dn.$details_title_input.on("blur",function(){
            dn.$details_title_input.hide();
            dn.$details_title_text.show();
            var newVal = dn.$details_title_input.val();
            if(newVal == dn.theFile.title)
                return;
            dn.theFile.title = newVal
            dn.ShowFileTitle(); //includes showStatus
            dn.ApplySyntaxChoice();
            dn.SaveFileTitle();
            dn.ReclaimFocus();
        }).on('keyup',function(e){
            if(e.which == WHICH.ENTER)
                dn.$details_title_input.trigger('blur');
        }).on('keydown',function(e){
            if(e.which == WHICH.ESC){
                dn.$details_title_input.val(dn.theFile.title);
                dn.$details_title_input.trigger('blur');
                dn.ignoreEscape = true; //stops ToggleWidget
            }
        });

    // File action buttons stuff
    dn.$menu_save.click(dn.SaveContent);
    dn.$menu_print.click(dn.DoPrint);
    dn.$menu_sharing.click(dn.DoShare);
    dn.$menu_history.click(dn.StartRevisionsWorker);

    // Description stuff
    dn.$details_description_text.click(function(){            
            dn.$details_description_text.hide();
            dn.$details_description_input.show();
            dn.$details_description_input.focus();
        });
    dn.$details_description_input.on("blur",function(){
            dn.$details_description_input.hide();
            dn.$details_description_text.show();
            var newVal = dn.$details_description_input.val();
            if(dn.theFile.description === newVal)
                return;
            dn.theFile.description = newVal;
            dn.ShowDescription();
            dn.SaveFileDescription();
            dn.ReclaimFocus();
        }).on('keydown',function(e){
            if(e.which == WHICH.ESC){
                dn.$details_description_input.val(dn.theFile.description);
                dn.$details_description_input.trigger('blur');
                dn.ignoreEscape = true;
            }
        });;
        
    // File custom props stuff
    dn.$file_newline_detect.click(function(){
         dn.SetProperty("newline","detect");
         dn.ReclaimFocus();      
    });
    dn.$file_newline_windows.click(function(){
         dn.SetProperty("newline","windows");
         dn.ReclaimFocus();
        });
    dn.$file_newline_unix.click(function(){
         dn.SetProperty("newline","unix");
         dn.ReclaimFocus();
        });
    dn.$file_tab_detect.attr("selected","true").click(function(){
        dn.SetProperty("tabs","detect");
        dn.ReclaimFocus();
    });
    dn.$file_tab_soft.click(function(){
        dn.SetFileTabsToSoftOrHard("spaces",0);
        dn.ReclaimFocus();
    });
    dn.$file_tab_soft.find('#file_tab_soft_dec').click(function(){
        dn.SetFileTabsToSoftOrHard("spaces",-1);
        dn.ReclaimFocus();
    });
    dn.$file_tab_soft.find('#file_tab_soft_inc').click(function(){
        dn.SetFileTabsToSoftOrHard("spaces",+1);
        dn.ReclaimFocus();
    })
    dn.$file_tab_hard.click(function(){
        dn.SetFileTabsToSoftOrHard("tab",0);
        dn.ReclaimFocus();
    });
    dn.$file_aceMode_detect.click(function(){
       dn.SetProperty("aceMode","detect"); 
    });
}

dn.SaveFileDescription = function(){
    if(dn.theFile.isBrandNew){
        dn.SaveNewFile(); 
        return;
    }
    
    dn.SaveFile(dn.theFile.fileId, {description: dn.theFile.description}, undefined, 
                $.proxy(dn.SaveDone,{description: ++dn.theFile.generationToSave.description}))
    dn.ShowStatus();
    return;
    
}

dn.SaveFileTitle = function(){
    if(dn.theFile.isBrandNew){
        dn.SaveNewFile(); 
        return;
    }
    //TODO: mime-type IMPORTANT!

    dn.SaveFile(dn.theFile.fileId, {title: dn.theFile.title}, undefined, 
                $.proxy(dn.SaveDone,{title: ++dn.theFile.generationToSave.title}))
    dn.ShowStatus();    
}

dn.ShowFileTitle = function(){
    dn.$details_title_text.text('Title: ' + dn.theFile.title);
    dn.$details_title_input.val(dn.theFile.title);
    document.title = (dn.theFile.isPristine ? "" : "*") + dn.theFile.title;
    dn.ShowStatus();
}

dn.ShowDescription = function(){
    dn.$details_description_text.textMulti('Description: ' + dn.theFile.description,true);
    dn.$details_description_input.val(dn.theFile.description);
}

// ############################
// Revisions stuff
// ############################
dn.CloseHistory = function(){
    dn.fileHistory.$revisions_display.remove();
    $(window).off("resize",dn.Revisions_WindowResize);
    $('#the_editor').show();
    dn.editor.resize();
    dn.isShowingHistory = false;
}
dn.Revisions_WindowResize = function(){
    if(dn.fileHistory.canShowResizeError){
        dn.ShowError("The history explorer displays poorly if you resize the window while it is open. (This is a bug.)");
        dn.fileHistory.canShowResizeError = false; //wait at least ERROR_DELAY_MS until displaying the error again
        setTimeout(function(){dn.fileHistory.canShowResizeError = true;},dn.ERROR_DELAY_MS);
    }    
}

dn.StartRevisionsWorker = function(){
    if(dn.theFile.isBrandNew){
        dn.ShowError("This is a new file.  It doesn't have any history to explore.")
        return;
    }
    dn.isShowingHistory = true;
    
    if(!dn.fileHistory){
        var $d = $("<div class='widget_box widget_revisions'>" + 
                    "<div class='widget_box_title widget_revisions_title'>File History</div>" +
                    "<div class='revision_caption_at'></div>" +
                    "<div class='revision_timeline'></div>" +
                    "<div class='revision_caption_from'></div>" +
                    "<div>Removed lines: <div class='inline_button' id='expand_removed'>expand</div>" + 
                            "<div class='inline_button' id='collapse_removed'>collapse</div></div>" +
                    "<br><div class='widget_divider'></div>" + 
                    "<div id='revisions_status'>Initialising...</div>" + 
                    "Press Esc to return to editing." +
                    "<br><div class='widget_divider'></div>" + 
                    "Please note that the history viewing tool is missing some important features and those that have been implemented may include the odd bug.</div>")
        dn.$widget_fileHistory = $d;
        dn.$widget_menu.after($d.hide());
        dn.fileHistory = {
            $revisions_display: $("<div class='revisions_view'><ol></ol></div>"),
            $view: null, 
            $new_li: $("<li class='rev_line' v='-1'/>"),
            $new_tick:  $("<div class='revision_tick'/>"),
            needToRefindViewChildren: false, //this flag tracks when the $rev_lines_ is out of date relative to children of $view
            $rev_lines_: [], // this is a single jQuery collection
            needToFixHeights: $([]),            
            $timeline: $d.find('.revision_timeline'),
            $revisions_status: $d.find('#revisions_status'),
            $revision_caption_from: $d.find('.revision_caption_from'),
            $revision_caption_at: $d.find('.revision_caption_at'),
            $expand_removed: $d.find('#expand_removed'),
            $collapse_removed: $d.find('#collapse_removed'),
            revisions: [], //array of objects with etag, isDownloaded, modifiedDate, $tick
            revisionFromEtag: {},
            at: null, //revision object
            from: null, //revision object,
            canShowResizeError: true, //used by Revisions_WindowResize
            worker: new Worker("revisionsworker.js")
        };
    
        dn.fileHistory.$view = dn.fileHistory.$revisions_display.find('ol'); 
        dn.fileHistory.$expand_removed.click(function(){dn.g_settings.set('historyRemovedIsExpanded',true)});
        dn.fileHistory.$collapse_removed.click(function(){dn.g_settings.set('historyRemovedIsExpanded',false)});
        dn.RevisionSetIsExpaned(dn.g_settings.get('historyRemovedIsExpanded'))

        var w = dn.fileHistory.worker;
        w.onmessage = dn.RevisionWorkerDelivery;
    }
    dn.fileHistory.worker.postMessage({ fileId: dn.theFile.fileId, 
                                        token: gapi.auth.getToken().access_token,
                                        init: true});
    dn.fileHistory.$revisions_display.appendTo($('body'));
    $(window).on("resize",dn.Revisions_WindowResize);
    dn.$widget_fileHistory.toggle(true);
    dn.$widget_menu.toggle(false);
    dn.fileHistory.$view.empty();
    $('#the_editor').hide();
    return false;
}

dn.RevisionSetIsExpaned = function(v){
    var h = dn.fileHistory;
    if(!h) return; //if we haven't yet initialised fileHistory stuff then ignore this for now, when we do initialise we will read and apply the g_settings value
    
    if(v){
        h.$expand_removed.attr("selected","true")
        h.$collapse_removed.removeAttr("selected");
        h.$view.attr("removed","expanded");
    }else{
        h.$collapse_removed.attr("selected","true")
        h.$expand_removed.removeAttr("selected");
        h.$view.attr("removed","collapsed")
    }
}
dn.RevisionSetAt = function(r,fromChangeEvent,fromTimelineCreation){
    var h = dn.fileHistory;
    h.at = r;
    if(!fromChangeEvent)
        h.$at_range.val(r.ind);    
    h.$revision_caption_at.textMulti(
            r.modifiedDate.toLocaleDateString({},{month:"short",day:"numeric",year: "numeric"}) + "\n" +
            r.modifiedDate.toLocaleTimeString({},{hour: "numeric",minute: "numeric"})
        )
    
    if(h.from && !fromTimelineCreation)
        h.worker.postMessage({showEtag: h.at.etag,
                      fromEtag: h.from.etag  });
}

dn.RevisionSetFrom = function(r,fromChangeEvent,fromTimelineCreation){
    var h = dn.fileHistory;
    h.from = r;
    if(!fromChangeEvent)
        h.$from_range.val(r.ind);
    h.$revision_caption_from.textMulti(
            r.modifiedDate.toLocaleDateString({},{month:"short",day:"numeric",year: "numeric"}) + "\n" +
            r.modifiedDate.toLocaleTimeString({},{hour: "numeric",minute: "numeric"})
        )
    
    if(h.at && !fromTimelineCreation)
        h.worker.postMessage({showEtag: h.at.etag,
                          fromEtag: h.from.etag  });
}

dn.DisplayRevisionTimeline = function(newRevisions){
    var h = dn.fileHistory;
    var rs = h.revisions;
    //TODO: update display based on newRevisions rather than starting from scratch
    
    h.$at_range = $("<input class='revision_at_range' type='range' min='0' max='" + (rs.length-1) + "'/>");
    h.$tick_box = $("<div class='revision_tick_box'/>");
    h.$from_range = $("<input class='revision_from_range' type='range' min='0' max='" + (rs.length-1) + "'/>");
    
        
    var attr = rs.map(function(t){ return { downloaded: t.isDownloaded || false }; });
    var text = Array.apply(null, Array(attr.length)).map(function () { return "" });
    var $ticks = h.$tick_box.insertClonedChildren(0,h.$new_tick,text,attr);
    
    for(var i=0;i<rs.length;i++){
        rs[i].ind = i;
        rs[i].$ = $ticks.eq(i);
    }
    
    h.$timeline.empty().append(h.$at_range).append(h.$tick_box).append(h.$from_range);

    h.$at_range.on("change",function(){
            dn.RevisionSetAt(dn.fileHistory.revisions[this.value],true);
        })
    h.$from_range.on("change",function(){
            dn.RevisionSetFrom(dn.fileHistory.revisions[this.value],true);
        })

    dn.RevisionSetFrom(rs.length > 1 ? rs[1] : rs[0],false,true);
    dn.RevisionSetAt(rs[0],false,true);
}

dn.RevisionWorkerDelivery = function(e){
    if(!e.data)
        return; //not sure if this is possible

    if(e.data.debug)
        console.log(e.data);
        
    var h = dn.fileHistory;
    //TODO: probably ought to use a more sensivle message system with a string command switching thign...but this is ok for now
    
    if(e.data.status)
        h.$revisions_status.textMulti(e.data.status);
        
    if(e.data.revisions){    
        h.revisions = e.data.revisions;
        e.data.revisions.forEach(function(r){ h.revisionFromEtag[r.etag] = r;});
        dn.DisplayRevisionTimeline(e.data.revisions);
        h.worker.postMessage({ showEtag: h.at.etag,
                               fromEtag: h.from.etag }); 
    }
    
    if(e.data.revisionDownloaded){
        var r = h.revisionFromEtag[e.data.revisionDownloaded];
        r.$.attr('downloaded',true);
        r.isDownloaded = true;
    }
    
    if(e.data.revsionDiffed){
        h.needToRefindViewChildren = true;
        var r = h.revisionFromEtag[e.data.revsionDiffed];
        r.$.attr('diffed',true);
        r.isDiffed = true;
        
        var newStuff = e.data.newStuffForDom;
        for(var i=0;i<newStuff.length;i++){
            var lines = newStuff[i].lines.map(function(str){return str || " "});  
                                            // "|| space" thing is a hack for auto height stuff
            h.needToFixHeights = h.needToFixHeights.add(
                            h.$view.insertClonedChildren(newStuff[i].at,h.$new_li,lines)    );            
        }
    }

    
    if(e.data.vals_ui8buffer){
        
        if(h.needToRefindViewChildren){
            h.$rev_lines_ = h.$view.children();
            h.needToRefindViewChildren = false;
        }
        var $rl_ = h.$rev_lines_;
        
        if(h.needToFixHeights.length){
            h.$revisions_status.textMulti("Obtaining line height data...");
            h.needToFixHeights.fixHeightFromAuto();
            h.needToFixHeights = $([]);
            h.$revisions_status.textMulti("Selecting lines...");
        }
        
        var vals = new Uint8Array(e.data.vals_ui8buffer)
        $rl_.attr('v',function(i){return vals[i]});
            
        // We have to manually set the width of the numbers (our version of ace's gutter)
        switch(e.data.digits){
            case 0:
            case 1:
            case 2:
                h.$view.attr('digits','');
                break;
            case 3:
                h.$view.attr('digits','###');
                break;
            case 4:
                h.$view.attr('digits','####');
                break;
            default:
                h.$view.attr('digits','#####');
        }
    }
    
        
}

// ############################
// Save stuff
// ############################

dn.SaveContent = function(){
    if(dn.theFile.isBrandNew){
        dn.SaveNewFile(); 
        return false;
    }
    
    if(!dn.theFile.isPristine){
        dn.theFile.dataToSave.body = dn.editor.getSession().getValue();
        dn.theFile.generationToSave.body++;
        $('.ace_content').attr('saving',true);
        dn.theFile.isSaving = true;
        dn.theFile.isPristine = true;
    }
    
    dn.ShowFileTitle(); //includes a showstatus calls
    dn.DoSave();
    return false;
}

dn.DoSave = function (){
    
    if(dn.theFile.isReadOnly){
        dn.ShowError("Cannot save read-only file.");
        return false;
    }
    
    if(!(dn.theFile.dataToSave.body || dn.theFile.dataToSave.title || dn.theFile.dataToSave.description)){
        dn.ShowError("No changes since last save.");
        return false;
    }

    var gens = {};
    var body, meta;
    if(dn.theFile.dataToSave.body){
        body = dn.theFile.dataToSave.body;
        gens.body = dn.theFile.generationToSave.body;
    }
    if(dn.theFile.dataToSave.title || dn.theFile.dataToSave.description){
        meta = {};
        if(dn.theFile.dataToSave.title){
            meta.title = dn.theFile.dataToSave.title;
            gens.title = dn.theFile.generationToSave.title;
        }
        if(dn.theFile.dataToSave.description){
            meta.description = dn.theFile.dataToSave.description; 
            gens.description = dn.theFile.generationToSave.description;
        }
    }
    dn.SaveFile(dn.theFile.fileId, meta, body, $.proxy(dn.SaveDone,gens))
    return false;
}

dn.SaveDone = function(resp){
    if(resp.error){
        if(resp.error.code == 401){
            dn.Reauth(dn.DoSave); //will make use of dn.theFile.dataToSave and generationToSave once auth is done.
        }else{
            var failures = []
            if(this.body && this.body == dn.theFile.generationToSave.body){
                failures.push("body");
                dn.theFile.isSaving = false;
                dn.theFile.isPristine = false;
                dn.ShowFileTitle();
                $('.ace_content').removeAttr('saving');
                dn.theFile.dataToSave.body = null;
            }
            if(this.title && this.title == dn.theFile.generationToSave.title)
                failures.push("title");
            if(this.description && this.description == dn.theFile.generationToSave.description)
                failures.push("description");
            
            if(failures.length){//it's possible that all parts of the save request have since been superceded, so we can ignore this failure
                dn.ShowError("Failed to save " +  dn.OxfordComma(failures) + ". Error #" + resp.error.code + (resp.error.message? "\n" + resp.error.message : ""));
                console.dir(resp);
            }            
        }
    }else{//success...
        if(this.body && this.body == dn.theFile.generationToSave.body){
            dn.theFile.isSaving = false;
            $('.ace_content').removeAttr('saving');
            dn.theFile.ext = resp.fileExtension;
            dn.g_settings.set('ext',resp.fileExtension);
            dn.theFile.dataToSave.body = null;
            
            if(dn.theFile.isBrandNew)
                dn.SavedNewFile(resp); 
        }
        if(this.title && this.title == dn.theFile.generationToSave.title){
            dn.theFile.dataToSave.title = null;
        }
        if(this.description && this.description == dn.theFile.generationToSave.description){
            dn.theFile.dataToSave.description = null;
        }

    }
    dn.ShowStatus();
}

dn.SaveFile = function (fileId, fileMetadata, fileText, callback) {
    //if fileId is null then a new file is created (can set fileMetadata.parents = [parentFolderId])
	//fileMetadata or fileText can be null.
	//See https://developers.google.com/drive/v2/reference/files/insert - Request Body for valid metaData.

	//build a multipart message body
	var boundary = dn.MakeBoundary();
	var delimiter = "\r\n--" + boundary + "\r\n";
	var close_delim = "\r\n--" + boundary + "--";

	var	messageBody = delimiter +
				'Content-Type: application/json\r\n' +
				'\r\n' + JSON.stringify(fileMetadata ? fileMetadata : {}); //note than in the multipart message upload you must provide some json metadata, even if it's empty.

	if(fileText){ 
		messageBody += delimiter +
				'Content-Type: application/octet-stream\r\n' +
				'Content-Transfer-Encoding: base64\r\n' +
				'\r\n' + btoa(unescape(encodeURIComponent(fileText))); //javascript strings are utf16 encoded, but btoa only accespts ASCII, somehow the two extra functions here smooth over this problem and produce the expected result at the server end.
	}
	messageBody += close_delim;

	var request = gapi.client.request({
		path: '/upload/drive/v2/files/' + (fileId ? fileId : ""),
		method: (fileId? 'PUT' : 'POST'),
		params: {'uploadType': 'multipart'},
		headers: {'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'} ,
		body: 	messageBody}
		);

    request.execute(callback);
}

dn.MakeBoundary = function(){
	//for MIME protocol, require a boundary that doesn't exist in the message content.
	//we could check explicitly, but this is essentially guaranteed to be fine:
	// e.g. "13860126288389.206091766245663"
	return (new Date).getTime() + "" + Math.random()*10;
}


// ############################
// Print stuff
// ############################

dn.DoPrint = function(){
    var content = dn.editor.session.doc.getAllLines();
    var html = Array(content.length);

    for(var i=0; i<content.length;i++)
        html[i] = "<li><div class='printline'>" + dn.LineToHTML(i) + '</div></li>';

    var printWindow = window.open('','');
    printWindow.document.writeln(
    		"<html><head><title>" + dn.theFile.title 
			+ "</title></head><style>"
			+ ace.require(dn.theme).cssText + "\nbody{font-size:"
			+ dn.g_settings.get('fontSize') *14 +"px; white-space:pre-wrap;" + 
			"font-family:'Monaco','Menlo','Ubuntu Mono','Droid Sans Mono','Consolas',monospace;}"
			+ "\nli{color:gray;}\n.printline{color:black;}</style>" + 
			"<body class='"+ dn.theme.replace("/theme/","-") +"'><ol id='content'>" + 
			html.join("") +
			"</ol></body></html>");
	printWindow.print();
    return false;
}

dn.LineToHTML = function (n){
    var printLayer = Object.create(ace.require('ace/layer/text').Text.prototype); 
	var tokens  = dn.editor.getSession().getTokens(n);
	var html = [];
	var screenColumn = 0;
	for (var i = 0; i < tokens.length; i++) {
	   var token = tokens[i];
	   var value = token.value.replace(/\t/g,'   ');//TODO:deal with tabs properly
	   if(value)
		   printLayer.$renderToken(html, 0, token, value);
	}
	return html.join('').replace(/&#160;/g,' ');
}


// ############################
// Clipboard stuff
// ############################

dn.Document_ClipboardLeft = function(){
        if(!dn.clipboardActive)
            return false;

        if( dn.clipboardIndex <= 0)
            return true;
        dn.clipboardIndex--;
        dn.editor.undo();
        dn.editor.insert(dn.g_clipboard.get(dn.clipboardIndex));
        return true;
}

dn.Document_ClipboardRight = function(){
        if(!dn.clipboardActive)
            return false;

        if( dn.clipboardIndex >= dn.g_clipboard.length-1)
            return true;

        dn.clipboardIndex++;
        dn.editor.undo();
        dn.editor.insert(dn.g_clipboard.get(dn.clipboardIndex));
        return true;
}

dn.Document_ClipboardKeyup = function(e){
    if(e.which == 17 || e.which == 91 || !e.ctrlKey){
        $(document).off('keyup',dn.Document_ClipboardKeyup);
        dn.clipboardActive = false;
        dn.$widget_clipboard.hide();
        if(dn.clipboard_info_timer){
            clearTimeout(dn.clipboard_info_timer);
            dn.clipboard_info_timer = null;
        }
    }
}

dn.OnPaste = function(text){
    if (dn.g_clipboard === undefined)
        return;
    
    $(document).on('keyup',dn.Document_ClipboardKeyup);
    dn.clipboardActive = true;
        
    dn.clipboardIndex = dn.g_clipboard.lastIndexOf(text); 
    if(dn.clipboardIndex == -1){ //it's possible the user copied some text from outside the DN, in which case we will add it to the clipboard now
       dn.clipboardIndex = dn.g_clipboard.push(text);
       while(dn.g_clipboard.length >dn.CLIPBOARD_MAX_LENGTH) //same as on copy
         dn.g_clipboard.remove(0);
    }
    if(dn.clipboard_info_timer)
        clearTimeout(dn.clipboard_info_timer);

    dn.clipboard_info_timer = setTimeout(function(){
        dn.clipboard_info_timer = null;
        dn.$widget_clipboard.show();
    },dn.CLIPBOARD_INFO_DELAY);
}

dn.OnCopy = function(text){
    if (dn.g_clipboard === undefined)
        return;
    
    dn.g_clipboard.push(text);
    while(dn.g_clipboard.length >dn.CLIPBOARD_MAX_LENGTH)
        dn.g_clipboard.remove(0);
}

dn.CreateClipboardTool = function(){
    var $d = $("<div class='widget_box widget_clipboard'>When you paste with 'ctrl-v' (or 'cmd-v') you can cycle through your Drive Notepad clipboard by pressing 'left' or 'right' before releaing the 'ctrl' (or 'cmd') key. <br><br> You can clear your clipboard history by clicking the relevant button in the widget menu.</div>");
    dn.$widget_clipboard = $d;
    dn.$widget_menu.after($d.hide());

    dn.$menu_clear_clipboard.click(function(){
            dn.g_clipboard.clear();
        });
    dn.$menu_clear_find_history.click(function(){
            dn.g_findHistory.clear();
        });
}


// ############################
// New file stuff
// ############################

dn.DoNew = function(){
    //TODO: this could actually just be a link, updated in settingschanged-ext
    var base = window.location.href.match(/^https?:\/\/[\w-.]*\/\w*/)[0];
    window.open(base + "?state=" + JSON.stringify({
                action: "create",
                folderId: dn.theFile.folderId ? dn.theFile.folderId : '',
                ext: dn.g_settings.get('ext')}),"_blank");
    return false;
}

dn.CreateNewTool = function(){
    dn.$menu_new.click(dn.DoNew);
}

dn.CreateFile = function(){
    dn.ApplySyntaxChoice();
    dn.theFile.isBrandNew = true;
    dn.ShowFileTitle();
    dn.ShowDescription();
    dn.ApplyNewlineChoice();
    dn.ApplyTabChoice();
    dn.theFile.contentIsLoaded = true;
    dn.ToggleWidget(false);
    dn.g_settings.set("widgetSub","file");  
    if(dn.g_settings.keep)
        dn.g_settings.keep("widgetSub");
}

dn.GuessMimeType = function(){
    // we set the mimeType on new files, it's too complicated to try and guess it otherwise (at least for now)
    if(dn.theFile.loadedMimeType)
        return dn.theFile.loadedMimeType;
    var plain = "text/plain";
    var ext = dn.theFile.title.match(/\.[0-9a-z]+$/i);

    if(!ext)
        return plain;
    else
        ext = ext[0].substr(1);
    
    return (ext in dn.EXT_TO_MIME_TYPE)? dn.EXT_TO_MIME_TYPE[ext] : plain;

}

dn.SaveNewFile = function(){
    var f = dn.theFile;
    if(f.isSaving){
        dn.ShowError("File is being created. Please wait.");
        return false;
    }
    var meta = {title: f.title, 
                description: f.description,
                mimeType: dn.GuessMimeType()};
    var parentId = f.folderId;
    if(parentId) 
        meta.parents =[{id:[parentId]}];
    f.dataToSave.body = dn.editor.getSession().getValue();
    f.dataToSave.title = meta.title;
    f.dataToSave.description = meta.description;
    var gens = {title: ++f.generationToSave.title, description: ++f.generationToSave.description,body: ++f.generationToSave.body};
    f.isSaving = true;
    f.isPristine = true;
    dn.ShowFileTitle();
    $('.ace_content').attr('saving',true);
    dn.ShowStatus();
    dn.SaveFile(null, meta, f.dataToSave.body, $.proxy(dn.SaveDone,gens));
}

dn.SavedNewFile = function(resp){
    dn.theFile.isBrandNew = false;
    dn.theFile.fileId = resp.id;
    dn.theFile.isShared = resp.shared;
    dn.theFile.ext = resp.fileExtension;
    history.replaceState({},dn.theFile.title,
            window.location.href.match(/^https?:\/\/[\w-.]*\/\w*/)[0] +
                "?state={\"action\":\"open\",\"ids\":[\"" + dn.theFile.fileId + "\"]}");
    dn.SetDriveLinkToFolder();
    dn.theFile.metaDataIsLoaded = true;
    dn.SaveAllFileProperties();
}

// ############################
// Scrolling stuff
// ############################

dn.SaveScrollLine = function(){
	dn.PatchProperty(dn.theFile.fileId, 
                    "ScrollToLine",
                    dn.GetScrollLine(),
                    'PUBLIC',null);
}

dn.GetScrollLine = function(){
    return  dn.editor.getSession().screenToDocumentPosition(dn.editor.renderer.getScrollTopRow(),0).row;
}

// ############################
// Load stuff
// ############################

dn.LoadFile = function(flag){
    //we assume that we only ever load one fileid per page load

    var fileId = dn.theFile.fileId; 
    dn.theFile.isLoadingMetaData = true;
    dn.ShowStatus();
    if(dn.apis.driveIsLoaded){
        if(flag === "document-ready")
            console.log("gapi.client.drive was loaded in time for document-ready.")
        gapi.client.drive.files.get({'fileId': fileId}).execute(dn.LoadFile_GotMetaData);
    }
}

dn.LoadFile_GotMetaData = function(resp) {
	if (!resp.error) {
	  dn.theFile.title = resp.title;
      dn.theFile.description = resp.description || '';
      dn.ShowDescription();
      dn.theFile.ext = resp.fileExtension
      dn.theFile.isReadOnly = !resp.editable;
      dn.theFile.isShared = resp.shared;
      dn.theFile.loadedMimeType = resp.mimeType;
      if(resp.parents && resp.parents.length){
          dn.theFile.folderId = resp.parents[0].id;
          dn.SetDriveLinkToFolder();
      }
	  var token = gapi.auth.getToken().access_token;
      dn.theFile.isLoadingMetaData = false;
      dn.theFile.metaDataIsLoaded = true;
      dn.theFile.isLoadingContent = true;
      dn.ShowFileTitle(); //includes a showStatus call
      if(resp.downloadUrl){
          $.ajax(resp.downloadUrl, {
        		headers: {Authorization: 'Bearer ' + token},
    			complete:dn.LoadFile_GotFileBody,
                dataType: 'text'
    			});    
      }else{
        dn.theFile.isLoadingContent = false;
        document.title = "Drive Notepad";
        dn.ShowStatus();
    	dn.ShowError("Download Error: " + "no download link for the file")
      }

	} else if (resp.error.code == 401) {
	  // Access token might have expired.
        dn.theFile.isLoadingMetaData = false;
        dn.Reauth(dn.LoadFile);
	} else {
        dn.theFile.isLoadingMetaData = false;
        document.title = "Drive Notepad";
        dn.ShowStatus();
        dn.ShowError(resp.error.message); 
	}
} 

dn.LoadFile_GotFileBody = function(resp,status){
	if(status == "success"){
        dn.theFile.isLoadingContent = false;
        dn.theFile.contentIsLoaded = true;
        dn.ShowStatus();
		                
        dn.settingSessionValue = true;
        dn.editor.session.setValue(resp.responseText);
        dn.settingSessionValue = false;
        dn.ApplyNewlineChoice(resp.responseText);
        dn.ApplySyntaxChoice();
        dn.ApplyTabChoice(); 
	}else{
        dn.theFile.isLoadingContent = false;
        document.title = "Drive Notepad";
        dn.ShowStatus();
		dn.ShowError("Download Error: " + resp.statusText)
	}
}


// ############################
// Change/history stuff
// ############################

dn.OnChange = function(e){
    //console.dir(e);

    if(!e.data || !e.data.range || dn.settingSessionValue)
        return;
        
    if(dn.theFile.isPristine){
        dn.theFile.isPristine = false;
        dn.ShowFileTitle();
    }

    if(!dn.g_settings.get('showGutterHistory'))
        return;

    var nClasses = dn.CHANGE_LINE_CLASSES.length-1;
    var h = dn.changeLineHistory;
    var s = dn.editor.getSession(); 

    var startRow = e.data.range.start.row;
    var endRow = e.data.range.end.row;

    if(dn.lastChange && dn.lastChange.startRow == startRow && dn.lastChange.endRow == endRow && startRow == endRow
        && dn.lastChange.action.indexOf("Text") != -1 && e.data.action.indexOf("Text") != -1){
            //if this change and the last change were both on the same single lines with action (insert|remove)Text...

            if(dn.lastChange.action == e.data.action){
                return; //same action as last time
            }else if(e.data.action == "removeText"){ // new action is removeText, old action was insertText
                s.removeGutterDecoration(startRow,dn.CHANGE_LINE_CLASSES[nClasses]);
                s.addGutterDecoration(startRow,dn.CHANGE_LINE_CLASSES_RM[nClasses]);
                h[startRow] = -nClasses;
                dn.lastChange.action = "removeText";
                return;
            }else{// new action is isnertText, old action was removeText
                s.removeGutterDecoration(startRow,dn.CHANGE_LINE_CLASSES_RM[nClasses]);
                s.addGutterDecoration(startRow,dn.CHANGE_LINE_CLASSES[nClasses]);
                h[startRow] = nClasses;
                dn.lastChange.action = "insertText";
                return;
            }

    }else{
        //otherwise we have an acutal new change
        dn.lastChange = {startRow: startRow, endRow: endRow, action: e.data.action};
    }

    //remove all visible decorations and update the changeLineHistory values (we'll add in the new classes at the end)
    for(var i=0;i<h.length;i++)if(h[i])
        s.removeGutterDecoration(i,h[i] < 0 ? 
                    dn.CHANGE_LINE_CLASSES_RM[-h[i]++] : 
                    dn.CHANGE_LINE_CLASSES[h[i]--]);

    //Update the changeLineHistory relating to the current changed lines
    if(e.data.action == "removeLines"){
        h.splice(startRow, endRow - startRow + 1);        
        h[startRow] = h[startRow+1] = -nClasses;
    }else if(e.data.action === "removeText"){
        h[startRow] = -nClasses;
    }else{
        var newLineCount = 0;
        if(e.data.action == "insertText")
            newLineCount = (e.data.text.match(/\n/g) || []).length;
        if(e.data.action == "insertLines")
            newLineCount = e.data.lines.length;
        h.splice.apply(h,[startRow,0].concat(Array(newLineCount)));

        for(var i=startRow;i<=endRow;i++)
            h[i] = nClasses;

    }

    for(var i=0;i<h.length;i++)if(h[i])
        s.addGutterDecoration(i,h[i]<0 ?
                dn.CHANGE_LINE_CLASSES_RM[-h[i]] :
                dn.CHANGE_LINE_CLASSES[h[i]]);
} 

dn.CreateGutterHistoryTool = function(){
    dn.$gutter_history_show.click(function(){
            dn.g_settings.set('showGutterHistory',1);
        });
    dn.$gutter_history_hide.click(function(){
        dn.g_settings.set('showGutterHistory',0);
        });
}

dn.QueryUnload = function(){
    if(!dn.theFile.isPristine)
        return "If you leave the page now you will loose the unsaved " + (dn.theFile.isBrandNew ? "new " : "changes to ") + "file '" + dn.theFile.title + "'."
}


// ############################
// Properties stuff
// ############################
dn.PropertyUpdated = function(propKey,newVal){
    console.log("[file custom property]  " + propKey + ": " + newVal);
    switch(propKey){
        case "newline":
            dn.ApplyNewlineChoice();
            break;
        case "tabs":            
            dn.ApplyTabChoice();
            break;
        case "aceMode":
            dn.ApplySyntaxChoice();
            break;
    }
    
}

dn.LoadDefaultProperties = function(){
    for(var k in dn.DEFAULT_CUSTOM_PROPS)
        dn.SetProperty(k,dn.DEFAULT_CUSTOM_PROPS[k]);
}

dn.GetPropertiesFromCloud = function() {    
    gapi.client.drive.properties.list({
    'fileId': dn.theFile.fileId
    }).execute(dn.GotAllFileProperties);
}

dn.GotAllFileProperties = function(resp){
    if(resp.items){
        dn.theFile.customPropExists = {};
        for(var i=0;i<resp.items.length;i++){
            dn.theFile.customProps[resp.items[i].key] = resp.items[i].value;
            dn.theFile.customPropExists[resp.items[i].key] = true;
            dn.PropertyUpdated(resp.items[i].key,resp.items[i].value);
        }
    }
}

dn.SaveAllFileProperties = function(){
    //To be used after creating a file, in order to set any of the props which had been modified before saving it
    for(var k in dn.theFile.customProps)
        dn.SetProperty(k,dn.theFile.customProps[k]);    
}

dn.SetProperty = function(propName,newVal){

    var oldVal = dn.theFile.customProps[propName]; 
    dn.theFile.customProps[propName] = newVal;
    if(oldVal !== newVal)
        dn.PropertyUpdated(propName,newVal);

    if(!(gapi && gapi.drive && dn.theFile.fileId))
        return;

    var dummyCallback = function(){}; //TODO: may want to do some error handling or something
    
    if(dn.DEFAULT_CUSTOM_PROPS[propName] == newVal){ //note that this is true in particular when SetProperty is called within LoadDefaultProperties
        if(dn.theFile.customPropExists[propName]){
             dn.theFile.customPropExists[propName] = false;
             gapi.client.drive.properties.delete({ //DELTE the property, which does exist, but is no longer required because the value has been set to the default
                fileId: dn.theFile.fileId, propertyKey: propName, visibility: 'PUBLIC'
                }).execute(dummyCallback);
        }
        //if the property doesn't exist and it's just been set to the default then we don't need to do anything.
    }else{            
        if(dn.theFile.customPropExists[propName] && oldVal !== newVal){
            gapi.client.drive.properties.patch({ //PATCH the property, which already exists
            fileId: dn.theFile.fileId, propertyKey: propName, visibility: 'PUBLIC', resource: {'value': newVal}
            }).execute(dummyCallback);
        }else{
            dn.theFile.customPropExists[propName] = true; //INSERT the property, because it doesn't yet exist, we may be coming via dn.SaveAllFileProperties() above
            gapi.client.drive.properties.insert({
            'fileId': dn.theFile.fileId, 'resource': {key: propName, value: newVal, visibility: 'PUBLIC'}
            }).execute(dummyCallback)
        }
    }
}


// ############################
// Drag-drop stuff
// ############################
//TODO: this may have a few bugs since it's not been tested for a while

dn.DocumentDragOver = function (evt) {
    evt = evt.originalEvent;
    evt.stopPropagation();
    evt.preventDefault();
    if(!(dn.theFile.isBrandNew && dn.theFile.isPristine)){
        evt.dataTransfer.dropEffect = 'none';
        if(dn.canShowDragDropError){
            dn.ShowError("File drag-drop is only permitted when the Drive Notpad page is displaying a new and unmodified file.")
            dn.canShowDragDropError = false; //wait at least ERROR_DELAY_MS until displaying the error again
            setTimeout(function(){dn.canShowDragDropError = true;},dn.ERROR_DELAY_MS);
        }
        return;
    }
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}
    
dn.DocumentDropFile = function(evt){
     if(!(dn.theFile.isBrandNew && dn.theFile.isPristine))
        return;
        
   evt = evt.originalEvent;
   evt.stopPropagation();
   evt.preventDefault();
   
   var files = evt.dataTransfer.files;
   if(files.length > 1){
       dn.ShowError("You cannot drag-drop multiple files onto the Drive Notepad page, only individual files.")
   }
   var file = files[0];
   dn.theFile.title = file.name;
   dn.CreateFile();
   dn.theFile.isReadingFileObject = true;   
   dn.ShowStatus();
   var r = new FileReader();
   r.onload = dn.DroppedFileRead;
   r.readAsText(file);      
}

dn.DroppedFileRead = function(e){
    dn.theFile.isReadingFileObject = false;
    dn.editor.getSession().setValue(e.target.result);
    // Note we don't encolse the above in a dn.settingSessionValue = true block so the change event will fire and set pristine to false and ShowStatus etc.
}

// ############################
// Page ready stuff
// ############################


dn.DocumentReady = function(e){
    dn.$widget = $('#the_widget')
				.translate(0,0)
				.on("mousedown",function(e){e.stopPropagation();})
				.show();
	dn.$widget_text= $('#widget_text')
					.click(dn.ToggleWidget);
	dn.$widget_move_handle = $('#widget_move_handle') 
							.mousedown(dn.WidgetMoveHandleMouseDown);
	dn.$widget_error_text = $('#widget_error_text');
	dn.$widget_error = $('#widget_error')
						.hide();
	dn.$widget_menu = $('#widget_menu')
						.hide(); 
    $("#the_editor").html("");
	dn.editor = ace.edit("the_editor");
    $('#the_editor').on('contextmenu',function(e){
        dn.ShowError("See the list of keyboard shortcuts for copy/paste, select-all, and undo/redo.")
    });
    dn.editor.on('focus',dn.BlurFindAndFocusEditor)
	dn.editor.focus();
	dn.editor.setTheme(dn.theme);
    dn.editor.getSession().on("change",dn.OnChange);
    dn.editor.on("paste", dn.OnPaste);
    dn.editor.on("copy", dn.OnCopy);
    dn.editor.setAnimatedScroll(true);
    
    
    dn.CreateMenu();
    dn.CreateFileDetailsTool();
    dn.CreateMenuSubs();
    dn.CreateIconMouseOver();
    
    dn.CreateShortcutsInfo();
    dn.CreateNewLineMenuTool();
    dn.CreateTabTool();

	dn.CreateFontSizeTool();
	dn.CreateWordWrapTool();
    dn.CreateGutterHistoryTool();
    dn.CreateClipboardTool();

    dn.CreateNewTool();
    dn.CreateOpenTool();

    dn.LoadDefaultSettings();
    dn.LoadDefaultProperties();
    
	dn.MakeKeyboardShortcuts();
	dn.CreatePopupButton();
    dn.CreateGotoLine();
    dn.CreateFindReplace();
    
	$(window).resize(dn.WidgetApplyAnchor)
             .on("beforeunload",dn.QueryUnload);

    //work out what caused the page to load
	var url = $.url(); 
	if(url.param('state')){
		var state = {};
		try{
			state = JSON.parse(url.param('state'));
		}catch(e){
			dn.ShowError("Unable to parse state:\n" + url.param('state'));
		}
		if(state.action && state.action == "open" &&state.ids && state.ids.length > 0){
            dn.theFile.fileId = state.ids[0];
			dn.LoadFile("document-ready") //will use the specified fileId
		}else if(state.action && state.action == "create"){
            dn.theFile.title = "untitled." + (state.ext ? state.ext : dn.g_settings.get('ext'));
			if(state.folderId)
                dn.theFile.folderId = state.folderId;
			dn.CreateFile(); //will use the specified title and folderId
		}
	}else{
        dn.theFile.title = "untitled." + dn.g_settings.get('ext');
        dn.CreateFile();
	}

}

dn.APILoaded = function(APIName){
    if(APIName == "drive"){
        dn.apis.driveIsLoaded = true;
        if(dn.theFile.isBrandNew)
            dn.$widget_menu.show();
        if(dn.theFile.fileId){ 
            console.log("gapi.client.drive was not loaded in time for document-ready. But did eventually arive.")
			dn.LoadFile();
            dn.GetPropertiesFromCloud();
        }
        else if(dn.theFile.title)
            dn.ShowStatus();        
	}
	if(APIName == 'userinfo'){
	   gapi.client.oauth2.userinfo.get().execute(function(a){
	   dn.userinfo = a;
       dn.menu_status_default = "Logged in as: " + a.name; 
	   dn.$menu_status.text(dn.menu_status_default);
        dn.SetDriveLinkToFolder();
	   });
	}
	if(APIName == 'drive-realtime'){
		dn.GetSettingsFromCloud();
	}
    if(APIName == 'picker'){
        console.log("got picker API");
    }
    if(APIName == 'sharer'){
        dn.$shareDialog = new gapi.drive.share.ShareClient(dn.CLIENT_ID);
    }
}

$(document).ready(dn.DocumentReady)
		.on("contextmenu",function(e){e.preventDefault();})
        .on("dragover", dn.DocumentDragOver) 
        .on("drop", dn.DocumentDropFile);

dn.urlUserId = (function(){
    try{
        return JSON.parse($.url().param('state'))['userId']
    }catch(e){return undefined}
})();

dn.auth_map = function(immeditate){
    var m = {'client_id': dn.CLIENT_ID, 'scope': dn.SCOPES.join(' '), 'immediate': immeditate}
    if (dn.urlUserId !== undefined){
            m['login_hint'] = dn.urlUserId;
            m['authuser'] = -1
    }
    return m
}

//Called when google client library is loaded
function handleClientLoad() {
    
	gapi.auth.authorize(dn.auth_map(true),
		dn.handleAuthResult);
} 


