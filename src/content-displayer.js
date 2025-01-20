class ContentDisplayer {
  constructor(options = {}) {
    this._contentGroups = new Map();
    this._individualContents = new Map();
    this._options = {
      triggerAttribute: "data-content-trigger",
      targetAttribute: "data-content-target",
      contentAttribute: "data-content-source",
      contentModeAttribute: "data-content-mode",
      contentPositionAttribute: "data-content-position",
      contentVisibleClass: "visible",
      contentWrapperClass: "content-wrapper",
      contentContainerClass: "content-container",
      transitionDuration: 300,
      tooltipOffset: 10,
      defaultPosition: "bottom",
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

    // Bind methods that will be used as event handlers
    this._handleKeydown = this._handleKeydown.bind(this);
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
    this._handleHover = this._handleHover.bind(this);
    this._handleHoverEnd = this._handleHoverEnd.bind(this);

    this._init();
    this._setupRootListeners();
  }

  _init() {
    try {
      const triggers = this._rootElement.querySelectorAll(
        `[${this._options.triggerAttribute}]`
      );
      triggers.forEach(this._processTrigger.bind(this));
    } catch (error) {
      this._options.onError?.("Initialization failed: " + error.message);
    }
  }

  _setupRootListeners() {
    // Listen on root element instead of document when possible
    this._rootElement.addEventListener("keydown", this._handleKeydown);
    this._rootElement.addEventListener("click", this._handleOutsideClick);

    // For tooltips, we attach listeners to the root element
    this._rootElement.addEventListener("mouseover", this._handleHover);
    this._rootElement.addEventListener("mouseout", this._handleHoverEnd);
  }

  _handleKeydown(e) {
    if (e.key === "Escape") {
      this.hideAllContent();
    }
  }

  _handleOutsideClick(e) {
    const isClickOnTrigger = e.target.closest(
      `[${this._options.triggerAttribute}]`
    );
    const isClickOnContent = e.target.closest(
      `.${this._options.contentContainerClass}`
    );

    if (!isClickOnTrigger && !isClickOnContent) {
      this.hideAllContent();
    }
  }

  _handleHover(e) {
    const trigger = e.target.closest(`[${this._options.triggerAttribute}]`);
    if (trigger) {
      const mode = trigger.getAttribute(this._options.contentModeAttribute);
      if (mode === "tooltip") {
        this._showContent(
          this._individualContents.get(trigger)?.container,
          trigger
        );
      }
    }
  }

  _handleHoverEnd(e) {
    const trigger = e.target.closest(`[${this._options.triggerAttribute}]`);
    if (trigger) {
      const mode = trigger.getAttribute(this._options.contentModeAttribute);
      if (mode === "tooltip") {
        this._hideContent(
          this._individualContents.get(trigger)?.container,
          trigger
        );
      }
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

  _createContentFromSource(source, mode = "modal") {
    let content;

    if (
      source.match(/\.(jpeg|jpg|gif|png)$/) != null ||
      source.includes("/api/placeholder/")
    ) {
      if (mode === "lightbox") {
        content = this._createLightboxContent(source);
      } else {
        const img = document.createElement("img");
        img.src = source;
        content = img;
      }
    } else if (source.trim().startsWith("<")) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = source;
      content = wrapper;
    } else {
      const div = document.createElement("div");
      div.textContent = source;
      content = div;
    }

    if (["modal", "drawer", "lightbox"].includes(mode)) {
      const closeBtn = document.createElement("button");
      closeBtn.className = "content-close";
      closeBtn.setAttribute("aria-label", "Fermer");
      closeBtn.addEventListener("click", () => this.hideAllContent());
      content.insertAdjacentElement("afterbegin", closeBtn);
    }

    return content;
  }

  _createLightboxContent(source) {
    const container = document.createElement("div");
    container.className = "lightbox-container";

    const img = document.createElement("img");
    img.src = source;
    container.appendChild(img);

    const nav = document.createElement("div");
    nav.className = "lightbox-nav";
    ["prev", "next"].forEach((direction) => {
      const btn = document.createElement("button");
      btn.className = `lightbox-${direction}`;
      btn.textContent = direction === "prev" ? "←" : "→";
      nav.appendChild(btn);
    });
    container.appendChild(nav);

    return container;
  }

  _setupContentContainer(trigger, contentSource) {
    try {
      const contentWrapper = document.createElement("div");
      const mode =
        trigger.getAttribute(this._options.contentModeAttribute) || "modal";
      const position =
        trigger.getAttribute(this._options.contentPositionAttribute) ||
        this._options.defaultPosition;

      contentWrapper.classList.add(
        this._options.contentWrapperClass,
        `content-mode-${mode}`,
        `content-position-${position}`
      );

      const contentContainer = document.createElement("div");
      contentContainer.classList.add(this._options.contentContainerClass);
      contentWrapper.appendChild(contentContainer);

      const content = this._createContentFromSource(contentSource, mode);
      contentContainer.appendChild(content);

      const targetId = trigger.getAttribute(this._options.targetAttribute);

      switch (mode) {
        case "modal":
        case "drawer":
        case "lightbox":
          document.body.appendChild(contentWrapper);
          break;

        case "tooltip":
        case "popover":
          document.body.appendChild(contentWrapper);
          this._setupPositionedContent(trigger, contentWrapper, mode);
          break;

        case "dropdown":
          trigger.parentNode.insertBefore(contentWrapper, trigger.nextSibling);
          break;

        case "accordion":
          const targetContainer = targetId
            ? document.getElementById(targetId)
            : trigger.parentNode;
          targetContainer.appendChild(contentWrapper);
          break;
      }

      if (targetId && mode === "accordion") {
        this._setupGroupContent(trigger, contentWrapper, targetId);
      } else {
        this._setupIndividualContent(trigger, contentWrapper);
      }

      if (mode !== "tooltip") {
        trigger.addEventListener("click", (e) => {
          e.preventDefault();
          this._handleContentClick(trigger);
        });
      }
    } catch (error) {
      this._options.onError?.(
        `Failed to setup content container: ${error.message}`,
        trigger
      );
    }
  }

  _setupPositionedContent(trigger, wrapper, mode) {
    const position =
      trigger.getAttribute(this._options.contentPositionAttribute) ||
      this._options.defaultPosition;
    const updatePosition = () => {
      const triggerRect = trigger.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const offset = this._options.tooltipOffset;

      let top, left;

      switch (position) {
        case "top":
          top = triggerRect.top - wrapperRect.height - offset;
          left = triggerRect.left + (triggerRect.width - wrapperRect.width) / 2;
          break;
        case "bottom":
          top = triggerRect.bottom + offset;
          left = triggerRect.left + (triggerRect.width - wrapperRect.width) / 2;
          break;
        case "left":
          top = triggerRect.top + (triggerRect.height - wrapperRect.height) / 2;
          left = triggerRect.left - wrapperRect.width - offset;
          break;
        case "right":
          top = triggerRect.top + (triggerRect.height - wrapperRect.height) / 2;
          left = triggerRect.right + offset;
          break;
      }

      if (left < offset) left = offset;
      if (left + wrapperRect.width > window.innerWidth - offset) {
        left = window.innerWidth - wrapperRect.width - offset;
      }
      if (top < offset) top = offset;
      if (top + wrapperRect.height > window.innerHeight - offset) {
        top = window.innerHeight - wrapperRect.height - offset;
      }

      wrapper.style.position = "fixed";
      wrapper.style.top = `${top}px`;
      wrapper.style.left = `${left}px`;
    };

    if (mode === "tooltip" || mode === "popover") {
      this._positionUpdaters = this._positionUpdaters || new Map();
      this._positionUpdaters.set(wrapper, updatePosition);

      window.addEventListener("scroll", updatePosition);
      window.addEventListener("resize", updatePosition);
      updatePosition();
    }
  }

  _setupGroupContent(trigger, contentWrapper, targetId) {
    if (!this._contentGroups.has(targetId)) {
      this._contentGroups.set(targetId, {
        visibleContentTrigger: null,
        contents: new Set(),
      });
    }
    this._contentGroups.get(targetId).contents.add({
      trigger,
      container: contentWrapper,
    });
  }

  _setupIndividualContent(trigger, contentWrapper) {
    this._individualContents.set(trigger, { container: contentWrapper });
  }

  _handleContentClick(clickedTrigger) {
    try {
      const mode =
        clickedTrigger.getAttribute(this._options.contentModeAttribute) ||
        "modal";
      const targetId = clickedTrigger.getAttribute(
        this._options.targetAttribute
      );

      if (targetId && mode === "accordion") {
        this._handleGroupContent(clickedTrigger, targetId, mode);
      } else {
        this._handleIndividualContent(clickedTrigger, mode);
      }
    } catch (error) {
      this._options.onError?.(
        `Failed to handle content click: ${error.message}`,
        clickedTrigger
      );
    }
  }

  _handleGroupContent(clickedTrigger, targetId, mode) {
    const group = this._contentGroups.get(targetId);
    if (group) {
      group.contents.forEach(({ trigger, container }) => {
        if (trigger === clickedTrigger) {
          this._toggleContent(container, trigger, mode);
        } else if (mode === "accordion") {
          this._hideContent(container, trigger);
        }
      });
    }
  }

  _handleIndividualContent(clickedTrigger, mode) {
    const contentData = this._individualContents.get(clickedTrigger);
    if (contentData) {
      this._toggleContent(contentData.container, clickedTrigger, mode);
    }
  }

  _toggleContent(container, trigger, mode) {
    const isVisible = container.classList.contains(
      this._options.contentVisibleClass
    );
    if (!isVisible) {
      this._showContent(container, trigger);
    } else {
      this._hideContent(container, trigger);
    }
  }

  _hideContent(container, trigger) {
    if (container) {
      container.classList.remove(this._options.contentVisibleClass);
      this._options.onContentHide?.(container, trigger);
    }
  }

  _showContent(container, trigger) {
    if (container) {
      container.classList.add(this._options.contentVisibleClass);
      this._options.onContentShow?.(container, trigger);
    }
  }

  showAllContent() {
    this._individualContents.forEach(({ container }, trigger) => {
      this._showContent(container, trigger);
    });
  }

  hideAllContent() {
    this._individualContents.forEach(({ container }, trigger) => {
      this._hideContent(container, trigger);
    });

    this._contentGroups.forEach((group) => {
      group.contents.forEach(({ container, trigger }) => {
        this._hideContent(container, trigger);
      });
    });
  }

  destroy() {
    // Remove bound event listeners
    this._rootElement.removeEventListener("keydown", this._handleKeydown);
    this._rootElement.removeEventListener("click", this._handleOutsideClick);
    this._rootElement.removeEventListener("mouseover", this._handleHover);
    this._rootElement.removeEventListener("mouseout", this._handleHoverEnd);

    // Remove position update listeners
    if (this._positionUpdaters) {
      this._positionUpdaters.forEach((updateFn) => {
        window.removeEventListener("scroll", updateFn);
        window.removeEventListener("resize", updateFn);
      });
      this._positionUpdaters.clear();
    }

    // Cleanup containers
    this._individualContents.forEach(({ container }) => container.remove());
    this._contentGroups.forEach((group) => {
      group.contents.forEach(({ container }) => container.remove());
    });

    // Clear maps
    this._contentGroups.clear();
    this._individualContents.clear();
  }
}
