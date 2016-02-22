const { browserHistory, Router, Route, IndexRoute, Link } = ReactRouter;

var PDFElem = React.createClass({
  propTypes: {
    elemId: React.PropTypes.string.isRequired,
    elemTitle: React.PropTypes.string.isRequired
  },
  render() {
    var url = 'editor/' + this.props.elemId;
    return(
      <div className='list-group-item'>
        <Link to={url}>{this.props.elemTitle}</Link>
      </div>
    );
  }
});

var PDFList = React.createClass({
  mixins: [ReactMeteorData],
  getMeteorData() {
    return {
      existingPDFs: PDFs.find({}).fetch()
    };
  },
  render() {
    var pdfElems = [];
    for(var index = 0; index < this.data.existingPDFs.length; index++) {
      var pdf = this.data.existingPDFs[index];
      pdfElems.push(
                    <PDFElem key={pdf._id}
                            elemTitle={pdf.metadata.title}
                            elemId={pdf._id} />
      );
    }
    return(
            <div className='panel panel-default'>
              <div className='panel-heading'>
                <h1>Stored PDFs</h1>
              </div>
              <div className='panel-body list-group'>
                {pdfElems}
              </div>
            </div>
          );
  }
});

var PDFAdder = React.createClass({
  mixins: [ReactMeteorData],
  getMeteorData() {
    return {
      userId: Meteor.userId()
    };
  },
  addPDF(event) {
    var uid = this.data.userId;
    var data = document.getElementById('pdfAddForm').children;
    //Validate data
    if((function checkData(data) {
      var valid = true;
      var invalidate = function(domObject) {
        domObject.style.borderColor = 'red';
        domObject.oninput = function() {
          domObject.oninput = null;
          domObject.style.borderColor = '';
        };
      };
      if(data.title.value === '') {
        valid = false;
        invalidate(data.title);
      }
      if(data.url.value === '') {
        valid = false;
        invalidate(data.url);
      }
      if(data.pdfFile.files.length < 1) {
        valid = false;
        invalidate(data.pdfFile);
        data.pdfFile.onchange = function() {
          data.pdfFile.onchange = null;
          data.pdfFile.style.borderColor = '';
        }
      }
      return valid;
    })(data) == false) {
      alert('Upload failed');
      return;
    }

    var file = new FS.File(data.pdfFile.files[0]);
    file.metadata = { creatorId: uid, title: data.title.value, url: data.url.value, shareWith: {} };

    var progressBar = document.getElementById('uploadProgress');
    (function watchProgress() {
      var progress = file.uploadProgress();
      progressBar.ariaValuenow = progress;
      progressBar.style.width = progress + '%';
      if(progress === 100) {
        return;
      }
      setTimeout(watchProgress, 10);
    })();

    PDFs.insert(file, function(error, fileObj) {
      if(error) {alert(error);}
    });
  },
  render() {
    return (
      <div className='panel panel-default'>
        <div className='panel-heading'>
          <h3>Upload a New Document</h3>
        </div>
        <div id='panel-body pdf-adder-form' id='pdfAddForm'>
          <input
            type='text'
            className='form-control'
            placeholder='PDF URL'
            id='url'></input>
          <input
            type='text'
            className='form-control'
            placeholder='PDF Title'
            id='title'></input>
          <input
            type='file'
            className='form-control'
            id='pdfFile'></input>
        </div>
        <button className='btn pull-left' onClick={this.addPDF}>Add PDF</button>
        <div className='progress'>
          <div className='progress-bar' role='progressbar' aria-valuenow='0'
            aria-valuemin='0' aria-valuemax='100' id='uploadProgress'>
            Upload Progress
          </div>
        </div>
      </div>
    );
  }
});

var PDFText = React.createClass({
  propTypes: {
    pdfDoc: React.PropTypes.object,
    pdfId: React.PropTypes.string.isRequired,
    pageNum:  React.PropTypes.number.isRequired
  },
  mixins: [ReactMeteorData],
  getMeteorData() {
    //TODO
    return {};
  },
  render() {
    if(!this.props.pdfDoc) {
      return (<div></div>);
    }
    console.log('Got PDF', this.props.pdfDoc);
    //TODO
    return (<div></div>);
  }
});

var PDFPage = React.createClass({
  propTypes: {
    pageNum: React.PropTypes.number.isRequired,
    pdfId: React.PropTypes.string.isRequired,
    //highlights: React.PropTypes.array //TODO: move highlights to parent node?
  },
  mixins: [ReactMeteorData],
  getMeteorData() {
    var id = this.props.pdfId;

    var data = {
      ready: false,
      uid: Meteor.userId()
    };

    var pageQuery = {docId: id, pageNum: this.props.pageNum};

    // Subscribe to highlights
    var highlightHandle = Meteor.subscribe('pdfHighlights', id);
    if(highlightHandle.ready()) {
      data.highlights = PDFHighlights.find(pageQuery).fetch();
    } else { return data; }

    // Get pdf
    var pdfHandle = Meteor.subscribe('pdfs');
    if(pdfHandle.ready()) {
      data.pdfRecords = PDFs.find({_id: id}).fetch();
    } else { return data; }

    // Get comments
    var commentHandle = Meteor.subscribe('pdfComments', id);
    if(commentHandle.ready()) {
      data.comments = PDFComments.find(pageQuery).fetch();
    } else { return data; }

    data.ready = true;

    return data;
  },
  getInitialState() {
    return {};
  },
  componentWillReceiveProps(nextProps) {
    if(nextProps.pdfId !== this.props.pdfId) {
      // New PDF
      this.setState({pdf:null, pdfPage:null});
    } else if(nextProps.pageNum !== this.props.pageNum) {
      // New Page, same PDF
      this.setState({pdfPage:null});
    } else {
      //TODO: just reload highlights
      this.setState({textContent: null});
    }
  },
  render() {
    if(this.data.ready === false) {
      return null;
    } else if (this.data.pdfRecords.length < 1) {
      return null;
    }

    // Cache data for callbacks
    var docId = this.props.pdfId;
    var pageNum = this.props.pageNum;
    var uid = this.data.uid;
    var highlights = this.data.highlights;
    var comments = this.data.comments;

    var that = this;

    // Load PDF binary
    if(!this.state.pdf) {
      var pdfRecord = this.data.pdfRecords[0];
      PDFJS.workerSrc = '/packages/wrk961_pdfjs/build/pdf.worker.js';
      PDFJS.getDocument(pdfRecord.url()).then(function(pdf) {
        that.setState({pdf: pdf});
      });
    } else { // PDF Binary Already Loaded
      var pdf = this.state.pdf;
      var canvasContainer = document.getElementById('pdfcontainer');
      if(pageNum > pdf.numPages) {
        canvasContainer.innerHTML = '<h1>End of Document</h1>';
        return;
      }

      // Load specific page
      if(!this.state.pdfPage) {
        pdf.getPage(pageNum).then(function(page) {
          that.setState({pdfPage: page});
        });
      } else { // Correct Page Already Loaded
          var page = this.state.pdfPage;
          var canvas = document.createElement('canvas');
          var context = canvas.getContext('2d');
          // TODO: make this less awful
          var scale = Math.max(1.5,(window.innerWidth / page.getViewport(1).width));
          var viewport = page.getViewport(scale);
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if(canvasContainer.children.length > 0) {
            // Clear canvas of existing stuff
           canvasContainer.innerHTML = '';
          }
          canvasContainer.appendChild(canvas);

          var $textLayerDiv = jQuery('<div />').addClass('textLayer')
                .css('height', viewport.height + 'px')
                .css('width', viewport.width + 'px')
                .offset({
                  top: $(canvas).offset().top,
                  left: $(canvas).offset().left
                }).attr('id', 'textLayerDiv');
          jQuery('#pdfcontainer').append($textLayerDiv);

          //Load text
          if(!this.state.textContent) {
            page.getTextContent().then(function(textContent) {
              that.setState({textContent:textContent});
            });
          } else {
            var textLayerDiv = $textLayerDiv.get(0);
            var textLayer = new TextLayerBuilder({
              textLayerDiv: textLayerDiv,
              pageIndex: pageNum -1,
              viewport: viewport
            });
            textLayer.setTextContent(this.state.textContent);
            page.render({canvasContext: context, viewport:viewport, textLayer: textLayer});
            textLayer.render();

            //Add highlight listener
            textLayerDiv.onmouseup = function(event) {
              // Use ctrl+click to save highlight
              if(event.ctrlKey == true) {
                var selection = document.getSelection();

                // We want a highlight, not a click
                if(selection.type !== 'Range' || selection.collapsed) {
                  return;
                }

                // Get selection contents
                var range = selection.getRangeAt(0);
                var selectData = {};
                var allChildren = textLayer.textDivs;
                var startDiv = range.startContainer.parentNode;
                var endDiv = range.endContainer.parentNode;
                selectData.startIndex = range.startOffset;
                selectData.endIndex = range.endOffset;
                function toDiv(elem) {
                  var offset = 0;
                  function getOffset(elem) {
                    if(elem.previousSibling !== null) {
                      return elem.previousSibling.innerText.length +
                        getOffset(elem.previousSibling);
                    }
                    return 0;
                  }
                  while(elem.nodeName !== 'DIV') {
                    offset += getOffset(elem);
                    elem = elem.parentNode;
                  }
                  return {elem: elem, offset: offset};
                }
                if(startDiv.nodeName !== 'DIV' || endDiv.nodeName !== 'DIV') {
                  //TODO: get data out of spans
                  var result = toDiv(startDiv);
                  startDiv = result.elem;
                  selectData.startIndex += result.offset;
                  result = toDiv(endDiv);
                  endDiv = result.elem;
                  selectData.endIndex += result.offset;
                }
                selectData.startNodeIndex = allChildren.indexOf(startDiv);
                selectData.endNodeIndex = allChildren.indexOf(endDiv);

                selectData.contents = selection.toString();
                selectData.docId = docId; //ID of the PDF
                selectData.pageNum = pageNum;
                selectData.uid = uid; //User ID
                console.log('Selection', selectData, 'from', selection);
                Meteor.call('addHighlight', selectData);
                return;
              } else if(event.altKey === true) { // Add comment listener
                var commentBox = document.createElement('div');
                commentBox.className = 'comment';
                var inputField = document.createElement('input');
                inputField.className = 'comment-input';
                commentBox.appendChild(inputField);

                var submitButton = document.createElement('button');
                submitButton.innerHTML = 'Save';
                submitButton.className = 'btn';
                submitButton.onclick = function(saveEvent) {
                  var commentData = {};
                  commentData.commentText = saveEvent.target.previousElementSibling.value;
                  var target = event.target;
                  while(target.nodeName !== 'DIV') {
                    target = target.parentNode;
                  }
                  commentData.targetNodeIndex = textLayer.textDivs.indexOf(target);
                  commentData.docId = docId;
                  commentData.pageNum = pageNum;
                  commentData.uid = uid;
                  Meteor.call('addComment', commentData);
                };
                commentBox.appendChild(submitButton);

                canvasContainer.appendChild(commentBox);

                $(commentBox).offset({
                  top: event.clientY - $(commentBox).height(),
                  left: event.clientX
                });
              }
            }//Highlight event listener

            // Add existing highlights
            highlights.forEach(function(highlight) {
              for(var idx = highlight.startNodeIndex; idx <= highlight.endNodeIndex; idx++) {
                var hlDiv = textLayer.textDivs[idx];
                //hlDiv.style.backgroundColor = 'red';
                hlDiv.style.opacity = '0.4';
                hlDiv.style.overflow = 'hidden';
                var spanChild = document.createElement('span');
                //TODO: clean up, move into separate react component if possible
                function spansExist(elem) {
                  if(elem.childNodes.length > 0) {
                    return elem.childNodes[0].nodeName === 'SPAN';
                  }
                  return false;
                }

                if(idx === highlight.startNodeIndex) {
                  //Check if div is already split
                  if(spansExist(hlDiv)) {
                    //TODO: iterate over spans and recolor
                    hlDiv.style.backgroundColor = 'red';
                    hlDiv.innerHTML = hlDiv.innerText;
                    continue;
                  }
                  var spanChildTwo = document.createElement('span');
                  spanChildTwo.innerHTML = hlDiv.innerHTML.substring(0, highlight.startIndex);
                  spanChild.innerHTML = hlDiv.innerHTML.substring(highlight.startIndex);
                  hlDiv.innerHTML = '';
                  hlDiv.appendChild(spanChildTwo);
                  hlDiv.appendChild(spanChild);
                } else if(idx === highlight.endNodeIndex) {
                  if(spansExist(hlDiv)) {
                    //TODO: iterate and recolor
                    hlDiv.style.backgroundColor = 'red';
                    hlDiv.innerHTML = hlDiv.innerText;
                    break;
                  }
                  var spanChildTwo = document.createElement('span');
                  spanChild.innerHTML = hlDiv.innerHTML.substring(0, highlight.endIndex);
                  spanChildTwo.innerHTML = hlDiv.innerHTML.substring(highlight.endIndex);
                  hlDiv.innerHTML = '';
                  hlDiv.appendChild(spanChild);
                  hlDiv.appendChild(spanChildTwo);
                } else {
                  spanChild.innerHTML = hlDiv.innerHTML;
                  hlDiv.innerHTML = '';
                  hlDiv.appendChild(spanChild);
                }
                spanChild.style.backgroundColor = 'red';
              }
            }); //Add highlights

            // Add existing comments
            var commentMap = {};
            comments.forEach(function(comment) {
              commentMap[comment.targetNodeIndex] = commentMap[comment.targetNodeIndex] || [];
              commentMap[comment.targetNodeIndex].push(comment);
            });
            var allChildren = textLayer.textDivs;
            for(var targetIndex in commentMap) {
              var matchedComments = commentMap[targetIndex];
              var textDiv = allChildren[targetIndex];

              var commentBox = document.createElement('div');
              commentBox.className = 'comment';
              // Add comments to box
              for(var commentIdx in matchedComments) {
                var comment = document.createElement('div');
                comment.className = 'comment-text';
                comment.innerHTML = matchedComments[commentIdx].commentText;
                commentBox.appendChild(comment);
              }

              // Add comment box to document
              textDiv.parentNode.appendChild(commentBox);

              // Position comment box
              var topOffset = parseFloat(textDiv.style.top.replace('px', '')) - (20 * matchedComments.length);
              topOffset = topOffset.toString() + 'px';
              commentBox.style.top = topOffset;
              commentBox.style.left = textDiv.style.left;
              $textLayerDiv.get(0).style.opacity = '1';

            } //Add comments
          }//Text layer load
      }// Page load
    } // PDF Load
    return (<PDFText
              pdfDoc={this.props.pdf}
              pdfId={this.props.pdfId}
              pageNum={this.props.pageNum}
            />
    );
  }
});

var PDFEditor = React.createClass({
  mixins: [ReactMeteorData],
  getMeteorData() {
    var data = { ready: false}
    var id = this.props.params.pdfId;
    var pdfHandle = Meteor.subscribe('pdfs');
    if(!pdfHandle.ready() || !id) {
      return data;
    } else {
      data.ready = true;
    }

    data.pdfRecord = PDFs.find({_id: id}).fetch()[0];
    return data;
  },
  propTypes: {
    pdfId: React.PropTypes.string,
    pageNum: React.PropTypes.string
  },
  render() {
    if(this.data.ready === false) { return null; }
    var pageNum = this.props.params.pageNum;
    if(!pageNum) {
      pageNum = 1;
    } else {
      pageNum = parseInt(pageNum);
    }
    return(
      <div className='container-fluid'>
        <h1>{this.data.pdfRecord.metadata.title}</h1>
        <p>URL: <a href={this.data.pdfRecord.metadata.url}>{this.data.pdfRecord.metadata.url}</a></p>
        <p>Page Number: {pageNum}</p>
        <h3>Select text while holding ctrl key to make a highlight.</h3>
        <div className='pdf-content' id='pdfcontainer'>
          <PDFPage
            pdfId={this.props.params.pdfId}
            pageNum={pageNum}>
          </PDFPage>
        </div>
        <div className='pull-right'>
          {(()=> {
              if(pageNum > 1){
                return (
                  <Link to={`/editor/${this.props.params.pdfId}/${pageNum - 1}`}>
                    <button className='btn'>Prev Page</button>
                  </Link>
                );
              }
              return null;
          })()}
          <Link to={`/editor/${this.props.params.pdfId}/${pageNum + 1}`}>
            <button className='btn'>Next Page</button>
          </Link>
        </div>
      </div>
    );
  }
});

var Main = React.createClass({
  render() {
    return(
            <div className='container'>
              <PDFList />
              <PDFAdder />
            </div>
          );
  }
});

var App = React.createClass({
  mixins: [ReactMeteorData],
  getMeteorData() {
    return {
      uid: Meteor.userId()
    };
  },
  render() {
    if(this.data.uid === undefined || this.data.uid === null) {
      var login = function(event) {
        Meteor.loginWithCas();
      };
      return (<a onClick={login} href='javascript:();'>Login</a>);
    }
    return(
      <div className='container-fluid Content'>{this.props.children}</div>
    );
  }
});

Meteor.startup(function() {
  ReactDOM.render((
    <Router history={browserHistory}>
      <Route path='/' component={App}>
        <IndexRoute component={Main} />
        <Route path='editor/:pdfId' name='editor' component={PDFEditor}>
          <Route path=':pageNum' />
        </Route>
      </Route>
    </Router>
  ), document.getElementById('document-body'));
});
