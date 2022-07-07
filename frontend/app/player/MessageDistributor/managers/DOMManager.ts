import type StatedScreen from '../StatedScreen';
import type { Message, SetNodeScroll, CreateElementNode } from '../messages';

import logger from 'App/logger';
import StylesManager, { rewriteNodeStyleSheet } from './StylesManager';
import ListWalker from './ListWalker';

const IGNORED_ATTRS = [ "autocomplete", "name" ];

const ATTR_NAME_REGEXP = /([^\t\n\f \/>"'=]+)/; // regexp costs ~

export default class DOMManager extends ListWalker<Message> {
  private isMobile: boolean;
  private screen: StatedScreen;
  private nl: Array<Node> = [];
  private isLink: Array<boolean> = []; // Optimisations
  private bodyId: number = -1;
  private postponedBodyMessage: CreateElementNode | null = null;
  private nodeScrollManagers: Array<ListWalker<SetNodeScroll>> = [];

  private stylesManager: StylesManager;

  private startTime: number;

  constructor(screen: StatedScreen, isMobile: boolean, startTime: number) {
    super();
    this.startTime = startTime;
    this.isMobile = isMobile;
    this.screen = screen;
    this.stylesManager = new StylesManager(screen);
  }

  get time(): number {
    return this.startTime;
  }

  append(m: Message): void {
    switch (m.tp) {
    case "set_node_scroll":
      if (!this.nodeScrollManagers[ m.id ]) {
        this.nodeScrollManagers[ m.id ] = new ListWalker();
      }
      this.nodeScrollManagers[ m.id ].append(m);
      return;
    //case "css_insert_rule": // ||   //set_css_data ???
    //case "css_delete_rule":
    // (m.tp === "set_node_attribute" && this.isLink[ m.id ] && m.key === "href")) {
    //  this.stylesManager.append(m);
    //  return;
    default:
      if (m.tp === "create_element_node") {
        switch(m.tag) {
          case "LINK":
            this.isLink[ m.id ] = true;
          break;
          case "BODY":
            this.bodyId = m.id; // Can be several body nodes at one document session?
          break;
        }
      } else if (m.tp === "set_node_attribute" && 
        (IGNORED_ATTRS.includes(m.name) || !ATTR_NAME_REGEXP.test(m.name))) {
        logger.log("Ignorring message: ", m)
        return; // Ignoring...
      }
      super.append(m);
    }

  }

  private removeBodyScroll(id: number): void {
    if (this.isMobile && this.bodyId === id) {
      (this.nl[ id ] as HTMLBodyElement).style.overflow = "hidden";
    }
  }

  // May be make it as a message on message add? 
  private removeAutocomplete({ id, tag }: CreateElementNode): boolean {
    const node = this.nl[ id ] as HTMLElement;
    if ([ "FORM", "TEXTAREA", "SELECT" ].includes(tag)) {
      node.setAttribute("autocomplete", "off");
      return true;
    }
    if (tag === "INPUT") {
      node.setAttribute("autocomplete", "new-password");
      return true;
    }
    return false;
  }

  // type = NodeMessage ?
  private insertNode({ parentID, id, index }: { parentID: number, id: number, index: number }): void {
    if (!this.nl[ id ]) {
      logger.error("Insert error. Node not found", id);
      return;
    }
    if (!this.nl[ parentID ]) {
      logger.error("Insert error. Parent node not found", parentID);
      return;
    }
    // WHAT if text info contains some rules and the ordering is just wrong???
    const el = this.nl[ parentID ]
    if ((el instanceof HTMLStyleElement) &&  // TODO: correct ordering OR filter in tracker
        el.sheet && 
        el.sheet.cssRules &&
        el.sheet.cssRules.length > 0 &&
        el.innerText.trim().length === 0) {
      logger.log("Trying to insert child to a style tag with virtual rules: ", this.nl[ parentID ], this.nl[ id ]);
      return;
    }

    const childNodes = this.nl[ parentID ].childNodes;
    if (!childNodes) {
      logger.error("Node has no childNodes", this.nl[ parentID ]);
      return;
    }

    if (this.nl[ id ] instanceof HTMLHtmlElement) {
      // What if some exotic cases?
      this.nl[ parentID ].replaceChild(this.nl[ id ], childNodes[childNodes.length-1])
      return
    }

    this.nl[ parentID ]
      .insertBefore(this.nl[ id ], childNodes[ index ])
  }

  private applyMessage = (msg: Message): void => {
    let node;
    let doc: Document | null;
    switch (msg.tp) {
      case "create_document":
        doc = this.screen.document;
        if (!doc) {
          logger.error("No iframe document found", msg)
          return;
        }
        doc.open();
        doc.write("<!DOCTYPE html><html></html>");
        doc.close();
        const fRoot = doc.documentElement;
        fRoot.innerText = '';
        this.nl = [ fRoot ];

        // the last load event I can control
        //if (this.document.fonts) {
        //  this.document.fonts.onloadingerror = () => this.marker.redraw();
        //  this.document.fonts.onloadingdone = () => this.marker.redraw();
        //}
        
        //this.screen.setDisconnected(false);
        this.stylesManager.reset();
        return
      case "create_text_node":
        this.nl[ msg.id ] = document.createTextNode('');
        this.insertNode(msg);
        return
      case "create_element_node":
        if (msg.svg) {
          this.nl[ msg.id ] = document.createElementNS('http://www.w3.org/2000/svg', msg.tag);
        } else {
          this.nl[ msg.id ] = document.createElement(msg.tag);
        }
        if (this.bodyId === msg.id) { // there are several bodies in iframes TODO: optimise & cache prebuild
          this.postponedBodyMessage = msg;
        } else {
          this.insertNode(msg);
        }
        this.removeBodyScroll(msg.id);
        this.removeAutocomplete(msg);
        return
      case "move_node":
        this.insertNode(msg);
        return
      case "remove_node":
        node = this.nl[ msg.id ]
        if (!node) { logger.error("Node not found", msg); return }
        if (!node.parentElement) { logger.error("Parent node not found", msg); return }
        node.parentElement.removeChild(node);
        return
      case "set_node_attribute":
        let { id, name, value } = msg;
        node = this.nl[ id ];
        if (!node) { logger.error("Node not found", msg); return }
        if (this.isLink[ id ] && name === "href") {
          // @ts-ignore TODO: global ENV type
          if (value.startsWith(window.env.ASSETS_HOST || window.location.origin + '/assets')) { // Hack for queries in rewrited urls
            value = value.replace("?", "%3F");
          }
          this.stylesManager.setStyleHandlers(node, value);
        }
        if (node.namespaceURI === 'http://www.w3.org/2000/svg' && value.startsWith("url(")) {
          value = "url(#" + (value.split("#")[1] ||")")
        }
        try {
          node.setAttribute(name, value);
        } catch(e) {
          logger.error(e, msg);
        }
        this.removeBodyScroll(msg.id);
        return
      case "remove_node_attribute":
        if (!this.nl[ msg.id ]) { logger.error("Node not found", msg); return }
        try {
          (this.nl[ msg.id ] as HTMLElement).removeAttribute(msg.name);
        } catch(e) {
          logger.error(e, msg);
        }
        return
      case "set_input_value":
        node = this.nl[ msg.id ]
        if (!node) { logger.error("Node not found", msg); return }
        if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
          logger.error("Trying to set value of non-Input element", msg)
          return
        }
        const val = msg.mask > 0 ? '*'.repeat(msg.mask) : msg.value
        doc = this.screen.document
        if (doc && node === doc.activeElement) {
          // For the case of Remote Control
          node.onblur = () => { node.value = val }
          return
        }
        node.value = val
        return
      case "set_input_checked":
        node = this.nl[ msg.id ];
        if (!node) { logger.error("Node not found", msg); return }
        (node as HTMLInputElement).checked = msg.checked;
        return
      case "set_node_data":
      case "set_css_data":
        node = this.nl[ msg.id ]
        if (!node) { logger.error("Node not found", msg); return }
        // @ts-ignore
        node.data = msg.data;
        if (node instanceof HTMLStyleElement) {
          doc = this.screen.document
          doc && rewriteNodeStyleSheet(doc, node)
        }
        return
      case "css_insert_rule":
        node = this.nl[ msg.id ];
        if (!node) { logger.error("Node not found", msg); return }
        if (!(node instanceof HTMLStyleElement) // link or null
          || node.sheet == null) { 
          logger.warn("Non-style node in  CSS rules message (or sheet is null)", msg);
          return
        }
        try {
          node.sheet.insertRule(msg.rule, msg.index)
        } catch (e) {
          logger.warn(e, msg)
          try {
            node.sheet.insertRule(msg.rule)
          } catch (e) {
            logger.warn("Cannot insert rule.", e, msg)
          }
        }
        return
      case "css_delete_rule":
        node = this.nl[ msg.id ];
        if (!node) { logger.error("Node not found", msg); return }
        if (!(node instanceof HTMLStyleElement) // link or null
          || node.sheet == null) { 
          logger.warn("Non-style node in  CSS rules message (or sheet is null)", msg);
          return
        }
        try {
          node.sheet.deleteRule(msg.index)
        } catch (e) {
          logger.warn(e, msg)
        }
        return
      case "create_i_frame_document":
        node = this.nl[ msg.frameID ];
        // console.log('ifr', msg, node)
        
        if (node instanceof HTMLIFrameElement) {
          doc = node.contentDocument;
          if (!doc) {
            logger.warn("No iframe doc", msg, node, node.contentDocument);
            return;
          }
          this.nl[ msg.id ] = doc.documentElement
          return;
        } else if (node instanceof Element) { // shadow DOM
          try {
            this.nl[ msg.id ] = node.attachShadow({ mode: 'open' })
          } catch(e) {
            logger.warn("Can not attach shadow dom", e, msg)
          }
        } else {
          logger.warn("Context message host is not Element", msg)
        }
        return
    } 
  }

  moveReady(t: number): Promise<void> {
    this.moveApply(t, this.applyMessage) // This function autoresets pointer if necessary (better name?)

    /* Mount body as late as possible */
    if (this.postponedBodyMessage != null) {
      this.insertNode(this.postponedBodyMessage)
      this.postponedBodyMessage = null
    }

    // Thinkabout (read): css preload
    // What if we go back before it is ready? We'll have two handlres?
    return this.stylesManager.moveReady(t).then(() => {
      // Apply all scrolls after the styles got applied
      this.nodeScrollManagers.forEach(manager => {
        const msg = manager.moveGetLast(t)
        if (!!msg && !!this.nl[msg.id]) {
          const node = this.nl[msg.id] as HTMLElement
          node.scrollLeft = msg.x
          node.scrollTop = msg.y
        }
      })
    })
  }
}