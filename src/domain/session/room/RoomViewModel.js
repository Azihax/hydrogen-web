/*
Copyright 2020 Bruno Windels <bruno@windels.cloud>
Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {TimelineViewModel} from "./timeline/TimelineViewModel.js";
import {avatarInitials, getIdentifierColorNumber} from "../../avatar.js";
import {ViewModel} from "../../ViewModel.js";

export class RoomViewModel extends ViewModel {
    constructor(options) {
        super(options);
        const {room, ownUserId, closeCallback} = options;
        this._room = room;
        this._ownUserId = ownUserId;
        this._timeline = null;
        this._timelineVM = null;
        this._onRoomChange = this._onRoomChange.bind(this);
        this._timelineError = null;
        this._sendError = null;
        this._closeCallback = closeCallback;
        this._composerVM = new ComposerViewModel(this);
    }

    async load() {
        this._room.on("change", this._onRoomChange);
        try {
            this._timeline = await this._room.openTimeline();
            this._timelineVM = new TimelineViewModel(this.childOptions({
                room: this._room,
                timeline: this._timeline,
                ownUserId: this._ownUserId,
            }));
            this.emitChange("timelineViewModel");
        } catch (err) {
            console.error(`room.openTimeline(): ${err.message}:\n${err.stack}`);
            this._timelineError = err;
            this.emitChange("error");
        }
    }

    dispose() {
        // this races with enable, on the await openTimeline()
        if (this._timeline) {
            // will stop the timeline from delivering updates on entries
            this._timeline.close();
        }
    }

    close() {
        this._closeCallback();
    }

    // room doesn't tell us yet which fields changed,
    // so emit all fields originating from summary
    _onRoomChange() {
        this.emitChange("name");
    }

    get name() {
        return this._room.name;
    }

    get timelineViewModel() {
        return this._timelineVM;
    }

    get error() {
        if (this._timelineError) {
            return `Something went wrong loading the timeline: ${this._timelineError.message}`;
        }
        if (this._sendError) {
            return `Something went wrong sending your message: ${this._sendError.message}`;
        }
        return "";
    }

    get avatarLetter() {
        return avatarInitials(this._room.name);
    }

    get avatarColorNumber() {
        return getIdentifierColorNumber(this._room.id)
    }

    get avatarUrl() {
        if (this._room.avatarUrl) {
            return this._room.mediaRepository.mxcUrlThumbnail(this._room.avatarUrl, 32, 32, "crop");
        }
        return null;
    }

    get avatarTitle() {
        return this.name;
    }
    
    async _sendMessage(message) {
        if (message) {
            try {
                await this._room.sendEvent("m.room.message", {msgtype: "m.text", body: message});
            } catch (err) {
                console.error(`room.sendMessage(): ${err.message}:\n${err.stack}`);
                this._sendError = err;
                this._timelineError = null;
                this.emitChange("error");
                return false;
            }
            return true;
        }
        return false;
    }

    get composerViewModel() {
        return this._composerVM;
    }
}

class ComposerViewModel extends ViewModel {
    constructor(roomVM) {
        super();
        this._roomVM = roomVM;
        this._isEmpty = true;
    }

    sendMessage(message) {
        const success = this._roomVM._sendMessage(message);
        if (success) {
            this._isEmpty = true;
            this.emitChange("canSend");
        }
        return success;
    }

    get canSend() {
        return !this._isEmpty;
    }

    setInput(text) {
        this._isEmpty = text.length === 0;
        this.emitChange("canSend");
    }
}
