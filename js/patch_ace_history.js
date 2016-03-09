

dn.patch_editor_history = function(editor){
    var Range = ace.require('./range').Range;
    var dom = ace.require("./lib/dom");

    var show_row = [];
    var row_line_number = [0];
    var markers = [];
    var first_rendered_row = -1;
    var rendered_row_transitions = []; // array of {from_time, to_time, from_color, to_color}, first element is first_rendered_row
    var colors_background = ['', '', 0xbcebe8, 0xffcaca]; //0,1,2,3, TODO: expose this as a setting, or read from css
    editor.$blockScrolling = Infinity;
    editor.setHighlightActiveLine(false);
    editor.setHighlightGutterLine(false);

    editor.session.gutterRenderer =  {
        getWidth: function(session, lastLineNumber, config) {
            return ("" + row_line_number[row_line_number.length-1]).length * config.characterWidth;
        },
        getText: function(session, row) {
            if(row >= row_line_number.length)
                return "" + row;
            return row_line_number[row] === -1 ? "-" : row_line_number[row];
        }
    };

    editor.session.removeAllGutterDecorations = function(){
        for(var ii=0; ii<this.$decorations.length; ii++)
            this.$decorations[ii] = "";
        this._signal("changeBreakpoint", {});
    }

    var insertFullLines_original = editor.session.doc.insertFullLines;
    editor.session.doc.insertFullLines = function(arg_0, arg_1){
        // Takes either two args: at, lines[]
        //  or 1 arg: [{at, lines}, {at, lines}, ...]
        // in the first case, if at=-1, we reset using the new data.
        if(arg_0 === -1){
            for(var ii=0;ii<arg_1.length; ii++)
                show_row.push(1);
            var len = this.getLength() - 1;
            this.remove(new Range(0, 0, len, this.getLine(len).length));
            this.insertMergedLines({row: 0, column: 0}, arg_1);
        }else{
            if(arg_0.length !== undefined){
                if(arg_1 !== undefined) throw "batched insert takes one array"
                for(var kk=0; kk<arg_0.length; kk++){
                    var splice_args = [arg_0[kk].at, 0];
                    for(var ii=0; ii<arg_0[kk].lines.length; ii++)
                        splice_args.push(0);
                    Array.prototype.splice.apply(show_row, splice_args);
                    insertFullLines_original.call(this, arg_0[kk].at, arg_0[kk].lines);
                }
            } else {
                var splice_args = [arg_0, 0];
                for(var ii=0; ii<arg_1.length; ii++)
                    splice_args.push(0);
                Array.prototype.splice.apply(show_row, splice_args);
                insertFullLines_original.call(this, arg_0, arg_1);
            }
        }
        editor.show_rows(show_row);
    }

    editor.renderer.addEventListener('afterRender', function(){
        // TODO: check if it's a kind of render we need to care about

        var first_row = editor.renderer.getFirstVisibleRow();
        var last_row = editor.renderer.getLastVisibleRow();
        var first_row_old = first_rendered_row;
        var last_row_old = first_row_old + rendered_row_transitions.length;

        var time_now = Date.now(); //ms
        console.log("Render request: " + first_row + ":"  + last_row + ", in state:");
        console.log(JSON.stringify(rendered_row_transitions));
        console.log("------")

        /*from_time: undefined,
        to_time: undefined,
        from_color: undefined,
        to_color: colors_background[show_row[row]],*/

        if(first_row_old < first_row){
            // remove unneeded rows from the start
            for(var row=first_row_old; row<last_row_old && row<first_row; row++)
                rendered_row_transitions.shift();
            
        } else if(first_row_old > first_row ) {
            // add some finished-transitioning rows at the start
            for(var row=Math.min(last_row, first_row_old)-1; row>=first_row; row--){
                rendered_row_transitions.unshift({row: row,
                                                  from_time: undefined,
                                                  from_color: undefined,
                                                  to_time: time_now,
                                                  to_color: colors_background[show_row[row]]});
            }
        }

        if(last_row_old > last_row){
            // remove unneeded rows from the end
            for(row=last_row_old-1; row>=last_row && row>=first_row_old; row--)
                rendered_row_transitions.pop();
            
        } else if(last_row_old < last_row) {
            // add some finished-transitioning rows at the end
            for(row=Math.max(last_row_old, first_row); row<last_row; row++)
                rendered_row_transitions.push({row: row,
                                               from_time: undefined,
                                               from_color: undefined,
                                               to_time: time_now,
                                               to_color: colors_background[show_row[row]]});  
        }

        first_rendered_row = first_row;
        console.log("achieved:")
        console.log(JSON.stringify(rendered_row_transitions));
    })

    editor.show_rows = function(show_row_){
        /* show_row is a 1d array the same length as the number of lines in the document,
           entries that are falsey are silently folded, the remaining rows have their 
           numbering altered.
           show_row[ii]>1 are marked with the class "special_2", "special_3",  etc,
           and the gutter is marked with gutter_special_2, _3, etc..

           show_row[ii]=3, is shown, but doesn't have a line number

           TODO: check zero-hack for when nothing is showing and/or there are no rows,
           and possibly other variations on that.
        */
        show_row = show_row_.slice(0);

        var n = editor.session.doc.getLength();
        if(show_row.length !== n) 
            throw "bad mask length";

        editor.session.unfold();
        while(markers.length)
            editor.session.removeMarker(markers.pop());
        editor.session.removeAllGutterDecorations();

        var line_no = 0;
        var fold_start = -1;
        row_line_number = [];
        var first_used_row = -1;
        for(var ii=0; ii<n; ii++){
            if(show_row[ii]){
                row_line_number.push(show_row[ii] === 3 ? -1 : ++line_no);
                if(fold_start !== -1){
                    if(fold_start > 0){
                        editor.session.addFold("", new Range(fold_start-1, Infinity, ii-1, Infinity));
                    } else {
                        // TODO: folding the lines from the very top is a bit messier...
                        //  it may be this version 0,0 rather than Inf, Inf version can be used more generally,
                        //  but it requires changing various other things too.
                        editor.session.addFold("", new Range(0, 0, ii, 0));
                        row_line_number[0] = 1;
                        first_used_row = ii;
                    }
                }
                fold_start = -1;
            }else{
                row_line_number.push(line_no);
                if(fold_start === -1)
                    fold_start = ii;
            }
        }
        if(fold_start !== -1)
            editor.session.addFold("", new Range(fold_start-1, Infinity, ii-1, Infinity));

        var previous = -1;
        if(first_used_row !== -1){
            //dealing further with the top-row hack thing...it's confusing, but this does the job...
            if(show_row[first_used_row]>1)
                editor.session.addGutterDecoration(0, "gutter_special_" + show_row[first_used_row]);
        }
        for(var ii=0; ii<n; ii++){
            if(show_row[ii]>1){
                markers.push(editor.session.addMarker(new Range(ii, 0, ii, Infinity),
                         "special_" + show_row[ii] + (previous !== show_row[ii] ? "_first" : ""), "fullLine", false));
                editor.session.addGutterDecoration(ii, "gutter_special_" + show_row[ii]);
            }
            previous = show_row[ii] ? show_row[ii] : previous;
        }

        editor.renderer.updateFull();
    };


    // this isn't that important, but we override the original version here so as to let the cursor blink in readonly mode
    editor.$resetCursorStyle = function() {
        var style = this.$cursorStyle || "ace";
        var cursorLayer = this.renderer.$cursorLayer;
        if (!cursorLayer)
            return;
        cursorLayer.setSmoothBlinking(/smooth/.test(style));
        cursorLayer.isBlinking = /*!this.$readOnly && */ style != "wide";
        dom.setCssClass(cursorLayer.element, "ace_slim-cursors", /slim/.test(style));
    };
    // but we have to disable dragging, or the cursor will stop blinking for some reason on failed drags
    editor.$mouseHandler.setOptions({dragEnabled: false})

}
