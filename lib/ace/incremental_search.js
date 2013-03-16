/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

define(function(require, exports, module) {
"use strict";

var oop = require("./lib/oop");
var Range = require("./range").Range;
var Search = require("./search").Search;
var iSearchCommandModule = require("./commands/incremental_search_commands");
var ISearchKbd = iSearchCommandModule.IncrementalSearchKeyboardHandler;

/**
 * @class IncrementalSearch
 *
 * Implements immediate searching while the user is typing. When incremental
 * search is activated, keystrokes into the editor will be used for composing
 * a search term. Immediately after every keystroke the search is updated:
 * - so-far-matching characters are highlighted
 * - the cursor is moved to the next match
 *
 **/


/**
 *
 *
 * Creates a new `IncrementalSearch` object.
 *
 * @constructor
 **/
function IncrementalSearch() {
    this.$options = {wrap: false, skipCurrent: false};
    this.$keyboardHandler = new ISearchKbd(this);
}

oop.inherits(IncrementalSearch, Search);

;(function() {

    this.activate = function(editor, backwards) {
        this.$editor = editor;
        this.$startPos = this.$currentPos = editor.getCursorPosition();
        this.$options.needle = '';
        this.$options.backwards = backwards;
        editor.keyBinding.addKeyboardHandler(this.$keyboardHandler);
        this.selectionFix(editor);
        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
        var msg = this.$options.backwards ? 'reverse-' : '';
        msg += 'isearch: ' + this.$options.needle;
        this.message(msg);
    }

    this.deactivate = function(reset) {
        this.cancelSearch(reset);
        this.$editor.keyBinding.removeKeyboardHandler(this.$keyboardHandler);
        this.message('');
    }

    this.selectionFix = function(editor) {
        // Fix selection bug: When clicked inside the editor
        // editor.selection.$isEmpty is false even if the mouse click did not
        // open a selection. This is interpreted by the move commands to
        // extend the selection. To only extend the selection when there is
        // one, we clear it here
        if (editor.selection.isEmpty() && !editor.session.$emacsMark) {
            editor.clearSelection();
        }
    }
    this.cancelSearch = function(reset) {
        var e = this.$editor;
        this.$prevNeedle = this.$options.needle;
        this.$options.needle = '';
        if (reset) {
            e.moveCursorToPosition(this.$startPos);
            this.$currentPos = this.$startPos;
        }
        e.session.highlight(null);
        e.renderer.updateBackMarkers(); // force highlight layer redraw
        return Range.fromPoints(this.$currentPos, this.$currentPos);
    }

    this.highlightAndFindWithNeedle = function(moveToNext, needleUpdateFunc) {
        if (!this.$editor) return null;
        var options = this.$options;

        // get search term
        if (needleUpdateFunc) {
            options.needle = needleUpdateFunc.call(this, options.needle || '') || '';
        }
        if (options.needle.length === 0) return this.cancelSearch(true);

        // try to find the next occurence and enable  highlighting marker
        options.start = this.$currentPos;
        var session = this.$editor.session,
            found = this.find(session);
        if (found) {
            if (options.backwards) found = Range.fromPoints(found.end, found.start);
            this.$editor.moveCursorToPosition(found.end);
            if (moveToNext) this.$currentPos = found.end;
            // highlight after cursor move, so selection works properly
            // also force highlight layer redraw
            session.highlight(options.re);
            this.$editor.renderer.updateBackMarkers();
        }

        var msg = options.backwards ? 'reverse-' : '';
        msg += 'isearch: ' + options.needle;
        if (!found) msg += ' (not found)';
        this.message(msg);

        return found;
    }

    this.addChar = function(c) {
        return this.highlightAndFindWithNeedle(false, function(needle) {
            return needle + c;
        });
    }

    this.removeChar = function(c) {
        return this.highlightAndFindWithNeedle(false, function(needle) {
            return needle.length > 0 ? needle.substring(0, needle.length-1) : needle;
        });
    }

    this.next = function(options) {
        // try to find the next occurence of whatever we have searched for
        // earlier.
        // options = {[backwards: BOOL], [useCurrentOrPrevSearch: BOOL]}
        options = options || {};
        this.$options.backwards = !!options.backwards;
        this.$currentPos = this.$editor.getCursorPosition();
        return this.highlightAndFindWithNeedle(true, function(needle) {
            return options.useCurrentOrPrevSearch && needle.length === 0 ?
                this.$prevNeedle || '' : needle;
        });
    }

    this.message = function(msg) {
        var cmdLine = this.$editor && this.$editor.cmdLine;
        if (cmdLine) {
            cmdLine.setValue(msg, 1);
        } else {
            console.log(msg);
        }
    }


}).call(IncrementalSearch.prototype);


exports.IncrementalSearch = IncrementalSearch;


/**
 *
 * Config settings for enabling/disabling [[IncrementalSearch `IncrementalSearch`]].
 *
 **/

function patchHighlightMarkerStyling(options) {
    options = options || {};
    var id = 'incremental-search-highlight-style-patch',
        style = document.getElementById(id);
    if (style) {
        if (options.enable) return;
        style.parentNode.removeChild(style);
        return;
    }
    if (!options.enable) return;
    style = document.createElement('style');
    style.setAttribute('id', id);
    style.textContent = "div.ace_selected-word {\n"
                      + "  background-color: orange !important;\n"
                      + "  border: 0 !important;"
                      + "}\n"
    document.getElementsByTagName('head')[0].appendChild(style);
}


// support for default keyboard handler
var CommandManager = require("./commands/command_manager").CommandManager;
(function() {
    this.setupIncrementalSearch = function(editor, val) {
        if (this.usesIncrementalSearch == val) return;
        this.usesIncrementalSearch = val;
        var iSearchCommands = iSearchCommandModule.iSearchStartCommands,
            method = val ? 'addCommands' : 'removeCommands';
        this[method](iSearchCommands);
    };
}).call(CommandManager.prototype);

// support for emacskeyboard handler
var emacs = require("./keyboard/emacs");
emacs.handler.setupIncrementalSearch = function(editor, val) {
    if (this.usesIncrementalSearch == val) return;
    this.usesIncrementalSearch = val;
    if (val) {
        this.bindKey('C-s', 'iSearch');
        this.bindKey('C-r', 'iSearchBackwards');
    } else {
        this.bindKey('C-s', "findnext");
        this.bindKey('C-r', "findprevious");
    }
}

// incremental search config option
var Editor = require("./editor").Editor;
require("./config").defineOptions(Editor.prototype, "editor", {
    useIncrementalSearch: {
        set: function(val) {
            patchHighlightMarkerStyling({enable: val});
            this.keyBinding.$handlers.forEach(function(handler) {
                if (handler.setupIncrementalSearch) {
                    handler.setupIncrementalSearch(this, val);
                }
            });
        }
    }
});

});