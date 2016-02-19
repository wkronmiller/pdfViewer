const { browserHistory, Router, Route, IndexRoute, Link } = ReactRouter;

var PDFElem = React.createClass({
	propTypes: {
		elemId: React.PropTypes.string.isRequired,
		elemTitle: React.PropTypes.string.isRequired
	},
	render() {
		var url = 'editor/' + this.props.elemId;
		return(
			<div className='pdf-list-elem'>
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
						<div className='container pdf-list-container'>
							<h1>Stored PDFs</h1>
							{pdfElems}
						</div>
					);
	}
});

var PDFAdder = React.createClass({
	mixins: [ReactMeteorData],
	getMeteorData() {
		return {
			userId: Meteor.userId
		};
	},
	addPDF(event) {
		var uid = this.data.userId;
		var data = event.target.parentNode.children.pdfAddForm.children;
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
		file.metadata = { creatorId: uid, title: data.title.value, url: data.url.value };
		
		console.log('File', file);

		var result = PDFs.insert(file, function(error) {
			if(error) {alert(error);}
		});
		console.log('Result', result);
	},
	render() {
		return (
			<div className='container pdf-adder-form'>
				<h3>Upload a New Document</h3>
				<div id='pdfAddForm'>
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
				<button className='btn pull-right' onClick={this.addPDF}>Add PDF</button>
			</div>
		);
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
	render() {
		if(this.data.ready === false) {
			return null;
		} else if (this.data.pdfRecords.length < 1) {
			return null;
		}
		var pdfRecord = this.data.pdfRecords[0];

		PDFJS.workerSrc = '/packages/wrk961_pdfjs/build/pdf.worker.js';
		
		// Cache data for callbacks
		var docId = this.props.pdfId;
		var pageNum = this.props.pageNum;
		var uid = this.data.uid;
		var highlights = this.data.highlights;
		var comments = this.data.comments;
		var reactThis = this;


		var doc = PDFJS.getDocument(pdfRecord.url()).then(function(pdf) {
			var canvasContainer = document.getElementById('pdfcontainer');
			if(pageNum > pdf.numPages) {
				canvasContainer.innerHTML = '<h1>End of Document</h1>';
				return;
			}
			if(canvasContainer.children.length > 0) {
				//PDF already loaded
				canvasContainer.innerHTML = '';
			}
			
			var renderPage = function(pageNum) {
				pdf.getPage(pageNum).then(function(page) {
					var canvas = document.createElement('canvas');
					var context = canvas.getContext('2d');
					var scale = Math.max(1,(window.innerWidth / page.getViewport(1).width));
					var viewport = page.getViewport(scale);
					canvas.height = viewport.height;
					canvas.width = viewport.width;
					
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
					page.getTextContent().then(function(textContent) {
						var textLayerDiv = $textLayerDiv.get(0);
						var textLayer = new TextLayerBuilder({
							textLayerDiv: textLayerDiv,
							pageIndex: pageNum -1,
							viewport: viewport
						});
						textLayer.setTextContent(textContent);
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
								selectData.startNodeIndex = allChildren.indexOf(range.startContainer.parentNode);
								selectData.endNodeIndex = allChildren.indexOf(range.endContainer.parentNode);
								selectData.startIndex = range.startOffset;
								selectData.endIndex = range.endOffset;
								selectData.contents = selection.toString();
								selectData.docId = docId; //ID of the PDF
								selectData.pageNum = pageNum;
								selectData.uid = uid; //User ID
								console.log('Selection', selectData);
								Meteor.call('addHighlight', selectData);
								return;
							} else if(event.altKey === true) { // Add comment listener
								console.log(event);
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
									commentData.targetNodeIndex = textLayer.textDivs.indexOf(event.target);
									commentData.docId = docId;
									commentData.pageNum = pageNum;
									commentData.uid = uid;
									console.log('Comment', commentData);
									Meteor.call('addComment', commentData);
								};
								commentBox.appendChild(submitButton);

								canvasContainer.appendChild(commentBox);

								$(commentBox).offset({
									top: event.clientY - $(commentBox).height(),
									left: event.clientX
								});

							}
						}

						// Add existing annotations
						addAnnotations(textLayer);

					});

					// Add existing annotations to a document
					var addAnnotations = function(textLayer) {
						// Add existing highlights
						highlights.forEach(function(highlight) {
							//TODO: be more selective with highlighting, use comments positioning as a start
							for(var idx = highlight.startNodeIndex; idx <= highlight.endNodeIndex; idx++) {
								var hlDiv = textLayer.textDivs[idx];
								hlDiv.style.backgroundColor = 'red';
								hlDiv.style.opacity = '0.4';
								/*var spanChild = document.createElement('span');
								spanChild.innerHTML = hlDiv.innerHTML;
								hlDiv.innerHTML = '';
								hlDiv.appendChild(spanChild);*/
								//TODO: make this work right
							}
						});

						// Add existing comments
						var commentMap = {};
						comments.forEach(function(comment) {
							commentMap[comment.targetNodeIndex] = commentMap[comment.targetNodeIndex] || [];
							commentMap[comment.targetNodeIndex].push(comment);
						});
						console.log('Comment map', commentMap);
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

						}
					}

				});
			};
			renderPage(pageNum);
		});

		return null;
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
