Espo.define('signature:views/fields/esignature', 'views/fields/base', function (Dep) {

    return Dep.extend({

        // jsignature templates
        detailTemplate: 'signature:fields/esignature/detail',
        editTemplate: 'signature:fields/esignature/edit',
        listTemplate: 'signature:fields/esignature/list',

        // jsignature properties
        blankCanvassCode: '',

        // jsignature methods        
        init: function () { // overrides "init" function from base.js
            if (this.events) {
                this.events = _.clone(this.events);
            } else {
                this.events = {};
            }

            this.defs = this.options.defs || {};
            this.name = this.options.name || this.defs.name;
            this.params = this.options.params || this.defs.params || {};
            this.fieldType = this.model.getFieldParam(this.name, 'type') || this.type;
            this.getFieldManager().getParamList(this.type).forEach(function (d) {
                var name = d.name;
                if (!(name in this.params)) {
                    this.params[name] = this.model.getFieldParam(this.name, name);
                    if (typeof this.params[name] === 'undefined') {
                        this.params[name] = null;
                    }
                }
            }, this);
            var additionaParamList = ['inlineEditDisabled'];
            additionaParamList.forEach(function (item) {
                this.params[item] = this.model.getFieldParam(this.name, item) || null;
            }, this);
            this.mode = this.options.mode || this.mode;
            this.tooltip = this.options.tooltip || this.params.tooltip || this.model.getFieldParam(this.name, 'tooltip');
            this.disabledLocked = this.options.disabledLocked || false;
            this.disabled = this.disabledLocked || this.options.disabled || this.disabled;
            // signature fields can only be seen in detail mode
            this.setMode('detail');
            this.on('invalid', function () {
                var $cell = this.getCellElement();
                $cell.addClass('has-error');
                this.$el.one('click', function () {
                    $cell.removeClass('has-error');
                });
                this.once('render', function () {
                    $cell.removeClass('has-error');
                });
            }, this);
            if ((this.isDetailMode() || this.isEditMode()) && this.tooltip) {
                this.initTooltip();
            }
            // signature fields can only be edited inline
            this.listenToOnce(this, 'after:render', this.initInlineEsignatureEdit, this);            
            this.attributeList = this.getAttributeList();
            this.listenTo(this.model, 'change', function (model, options) {
                if (this.isRendered() || this.isBeingRendered()) {
                    if (options.ui) {
                        return;
                    }
                    var changed = false;
                    this.attributeList.forEach(function (attribute) {
                        if (model.hasChanged(attribute)) {
                            changed = true;
                        }
                    });
                    if (changed) {
                        this.reRender();
                    }
                }
            }.bind(this));
            this.listenTo(this, 'change', function () {
                var attributes = this.fetch();
                this.model.set(attributes, {ui: true});
            });
        },

        data: function () { // overrides "data" function from base.js
            var imageSource = this.getValueForDisplay();
            var data = {
                scope: this.model.name,
                name: this.name,
                defs: this.defs,
                params: this.params,
                value: this.getValueForDisplay(),
                imageSource: imageSource                
            };  
            // signature fields can not be edited manually, force detail mode
            if(this.mode !== "detail") {
                this.setMode("detail");
            }
            return data;
        },

        initInlineEsignatureEdit: function () { // jsignature function equivalent to "initInlineEdit" at base.js  
            var $cell = this.getCellElement();
            var $editLink = $('<a href="javascript:" class="pull-right inline-edit-link hidden"><span class="fas fa-pencil-alt fa-sm"></span></a>');
            if ($cell.length === 0 || typeof(this.model.get(this.name))=== 'undefined') {
                this.listenToOnce(this, 'after:render', this.initInlineEsignatureEdit, this);
                return;
            }
            // if the signature field already has a value do not add the inline edit link and set the field as readonly
            if(this.model.get(this.name)) {
                this.readOnly = true;
                return;                
            }
            // after the element has been rendered, add the hidden pencil icon link
            $cell.prepend($editLink);
            $editLink.on('click', function () {
                // when clicked, call the jsignature signature field inline edit function
                this.inlineEsignatureEdit();
            // bind the functionality to the pencil icon link    
            }.bind(this));
            $cell.on('mouseenter', function (e) {
                e.stopPropagation();
                if (this.disabled || this.readOnly) {
                        return;
                }
                if (this.mode === 'detail') {
                    $editLink.removeClass('hidden');
                }
            }.bind(this)).on('mouseleave', function (e) {
                e.stopPropagation();
                if (this.mode === 'detail') {
                    $editLink.addClass('hidden');
                }
            }.bind(this));
        },

        inlineEsignatureEdit: function() { // jsignature function equivalent to "inlineEdit" at base.js            
            // add css class esignature to the field element
            this.$el.addClass('eSignature');
            // initialize jSignature plug-in to display canvas input
            var $sigDiv = this.$el.jSignature({'UndoButton':true, 'color':'rgb(5, 1, 135)'});
            this.blankCanvassCode = this.$el.jSignature('getData', 'image');
            // add the inline action links ("Update" and "Cancel")
            this.addInlineEditLinks(); // function inherited from base.js              
        },

        inlineEditClose: function () { // substitutes same function at base.js
            this.trigger('inline-edit-off');
            this._isInlineEditMode = false;
            this.once('after:render', function () {
                // remove the inline edit links
                this.removeInlineEditLinks(); // function inherited from base.js
            }, this);
            // re-renders the entity in detail mode
            this.reRender(true);
        },

        inlineEditSave: function () { // substitutes same function at base.js  
            // convert the canvas drawing to image code
            var imageCode = this.$el.jSignature('getData', 'image');
            // compare the contents of the current vs blank canvass to make sure there's a signature to be saved
            if(this.blankCanvassCode[1] === imageCode[1]) {
                alert("No signature was entered");
                this.inlineEditClose();
                return;
            }            
            // prepare the signature drawing to be stored in the database
            var imageSource = 'data:'+this.$el.jSignature('getData', 'image');
            this.notify('Saving...');
            var self = this;
            var model = this.model;
            var prev = this.initialAttributes;
            var data = model.attributes;
            // store the image code as the field value
            data[this.name] = imageSource;
            // persist the model with the updated field value
            this.model.save(data, {
                success: function () {
                    self.trigger('after:save');
                    model.trigger('after:save');
                    self.notify('Saved', 'success');
                },
                error: function () {
                    self.notify('Error occured', 'error');
                    // undo all field value changes
                    model.set(prev, {silent: true});
                    // re-render with the original values
                    self.render();
                },
                patch: true
            });
            this.inlineEditClose();
        }

    });
});
