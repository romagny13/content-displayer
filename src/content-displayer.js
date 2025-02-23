class BaseContentManager {
  constructor(options = {}) {
    this._contentGroups = new Map();
    this._individualContents = new Map();
    this._options = {
      triggerAttribute: "data-content-trigger",
      targetAttribute: "data-content-target",
      contentAttribute: "data-content-source",
      contentVisibleClass: "visible",
      contentWrapperClass: "content-wrapper",
      contentContainerClass: "content-container",
      transitionDuration: 300,
      onContentShow: null,
      onContentHide: null,
      onError: null,
      rootContainer: null,
      ...options,
    };

    this._rootElement =
      this._options.rootContainer instanceof HTMLElement
        ? this._options.rootContainer
        : document.querySelector(this._options.rootContainer) || document;
  }

  initialize() {
    try {
      const triggers = this._rootElement.querySelectorAll(
        `[${this._options.triggerAttribute}="${this.triggerType}"]`
      );
      triggers.forEach(this._processTrigger.bind(this));
    } catch (error) {
      this._options.onError?.("Initialization failed: " + error.message);
    }
  }

  _processTrigger(trigger) {
    if (trigger.dataset.contentProcessed) return;

    const contentSource = trigger.getAttribute(this._options.contentAttribute);
    if (!contentSource) {
      this._options.onError?.("No content source specified");
      return;
    }

    this._setupContentContainer(trigger, contentSource);
    trigger.dataset.contentProcessed = "true";
  }

  _setupContentContainer(trigger, contentSource) {
    try {
      const contentWrapper = document.createElement("div");
      contentWrapper.classList.add(this._options.contentWrapperClass);

      const contentContainer = document.createElement("div");
      contentContainer.classList.add(this._options.contentContainerClass);
      contentWrapper.appendChild(contentContainer);

      const content = this._createContent(contentSource);
      contentContainer.appendChild(content);

      const targetId = trigger.getAttribute(this._options.targetAttribute);
      if (targetId) {
        this._setupGroupContent(trigger, contentWrapper, targetId);
      } else {
        this._setupIndividualContent(trigger, contentWrapper);
      }

      trigger.addEventListener("click", (e) => {
        e.preventDefault();
        this._handleContentClick(trigger);
      });
    } catch (error) {
      this._options.onError?.(
        `Failed to setup content container: ${error.message}`,
        trigger
      );
    }
  }

  // Abstract method to be implemented by child classes
  _createContent(source) {
    throw new Error("_createContent must be implemented by child class");
  }

  _setupGroupContent(trigger, contentWrapper, targetId) {
    const targetContainer = document.getElementById(targetId);
    if (targetContainer) {
      if (!this._contentGroups.has(targetId)) {
        this._contentGroups.set(targetId, {
          visibleContentTrigger: null,
          contents: new Set(),
          id: targetId,
        });
      }
      this._contentGroups.get(targetId).contents.add({
        trigger,
        container: contentWrapper,
      });
      targetContainer.appendChild(contentWrapper);
    } else {
      this._options.onError?.(
        `Target container with id '${targetId}' not found`,
        trigger
      );
    }
  }

  _setupIndividualContent(trigger, contentWrapper) {
    this._individualContents.set(trigger, { container: contentWrapper });
    trigger.parentNode.insertBefore(contentWrapper, trigger.nextSibling);
  }

  _handleContentClick(clickedTrigger) {
    try {
      const targetId = clickedTrigger.getAttribute(
        this._options.targetAttribute
      );
      if (targetId) {
        this._handleGroupContent(clickedTrigger, targetId);
      } else {
        this._handleIndividualContent(clickedTrigger);
      }
    } catch (error) {
      this._options.onError?.(
        `Failed to handle content click: ${error.message}`,
        clickedTrigger
      );
    }
  }

  _handleGroupContent(clickedTrigger, targetId) {
    const group = this._contentGroups.get(targetId);
    if (group) {
      group.contents.forEach(({ trigger, container }) => {
        if (trigger === clickedTrigger) {
          this._toggleVisibility(group, trigger, container);
        } else {
          this._hideContent(container, trigger, group);
        }
      });
    }
  }

  _handleIndividualContent(clickedTrigger) {
    const contentData = this._individualContents.get(clickedTrigger);
    if (contentData) {
      this._toggleContent(contentData.container, clickedTrigger);
    }
  }

  _toggleVisibility(group, trigger, container) {
    if (group.visibleContentTrigger === trigger) {
      this._hideContent(container, trigger, group);
      group.visibleContentTrigger = null;
    } else {
      const duration = group.visibleContentTrigger
        ? this._options.transitionDuration
        : 0;
      this._showContentWithDelay(container, trigger, duration, group);
    }
  }

  _showContentWithDelay(container, trigger, duration, group) {
    setTimeout(() => {
      this._showContent(container, trigger, group);
      if (group) group.visibleContentTrigger = trigger;
    }, duration);
  }

  _hideContent(container, trigger, group = null) {
    container.classList.remove(this._options.contentVisibleClass);
    this._options.onContentHide?.(container, trigger, group);
  }

  _showContent(container, trigger, group = null) {
    container.classList.add(this._options.contentVisibleClass);
    this._options.onContentShow?.(container, trigger, group);
  }

  _toggleContent(container, trigger) {
    const isVisible = container.classList.contains(
      this._options.contentVisibleClass
    );
    if (!isVisible) {
      this._showContent(container, trigger);
    } else {
      this._hideContent(container, trigger);
    }
  }

  showAllContent() {
    this._individualContents.forEach(({ container }, trigger) => {
      this._showContent(container, trigger);
    });

    this._contentGroups.forEach((group) => {
      if (!group.visibleContentTrigger) {
        const firstContent = Array.from(group.contents)[0];
        if (firstContent) {
          const { container, trigger } = firstContent;
          this._showContent(container, trigger, group);
          group.visibleContentTrigger = trigger;
        }
      }
    });
  }

  hideAllContent() {
    this._individualContents.forEach(({ container }, trigger) => {
      this._hideContent(container, trigger);
    });

    this._contentGroups.forEach((group) => {
      group.contents.forEach(({ container, trigger }) => {
        this._hideContent(container, trigger, group);
      });
      group.visibleContentTrigger = null;
    });
  }

  destroy() {
    this._individualContents.forEach(({ container }, trigger) => {
      container.remove();
      trigger.dataset.contentProcessed = null;
    });

    this._contentGroups.forEach((group) => {
      group.contents.forEach(({ container, trigger }) => {
        container.remove();
        trigger.dataset.contentProcessed = null;
      });
    });

    this._contentGroups.clear();
    this._individualContents.clear();
  }
}

// Specialized manager for HTML content
class HtmlContentManager extends BaseContentManager {
  get triggerType() {
    return 'html';
  }

  _createContent(source) {
    if (!source.trim().startsWith("<")) {
      const div = document.createElement("div");
      div.textContent = source;
      return div;
    }
    const wrapper = document.createElement("div");
    wrapper.innerHTML = source;
    return wrapper;
  }
}

// Specialized manager for Image content
class ImageContentManager extends BaseContentManager {
  get triggerType() {
    return 'img';
  }

  _createContent(source) {
    const img = document.createElement("img");
    img.src = source;
    img.loading = "lazy";
    // img.className = "content-image"; // ?

    // Add loading state
    img.addEventListener("load", () => {
      img.classList.add("loaded");
    });

    // Add error handling
    img.addEventListener("error", () => {
      img.classList.add("error");
      this._options.onError?.("Failed to load image: " + source);
    });
    return img;
  }
}

// Usage example
class ContentDisplayer {
  constructor(options = {}) {
    this.htmlManager = new HtmlContentManager(options);
    this.imageManager = new ImageContentManager(options);
    this.initialize();
  }

  initialize() {
    this.htmlManager.initialize();
    this.imageManager.initialize();
  }

  showAllContent() {
    this.htmlManager.showAllContent();
    this.imageManager.showAllContent();
  }

  hideAllContent() {
    this.htmlManager.hideAllContent();
    this.imageManager.hideAllContent();
  }

  destroy() {
    this.htmlManager.destroy();
    this.imageManager.destroy();
  }
}
