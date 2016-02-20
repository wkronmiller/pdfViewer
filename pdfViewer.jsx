//TODO: real security
PDFs = new FS.Collection('pdfs', {
	stores: [new FS.Store.GridFS('pdfs')],
	filter: {
		allow: {
			extensions: ['pdf']
		}
	}	
});

PDFHighlights = new Mongo.Collection('pdfHighlights');
PDFComments = new Mongo.Collection('pdfComments');
 
if(Meteor.isServer) {
	Meteor.publish('pdfs', function() {
		return PDFs.find({});
	});
	Meteor.publish('pdfHighlights', function(pdfId) {
		//TODO: only publish current PDF
		console.log('Publishing highlights for document', pdfId);
		return PDFHighlights.find({});
	});
	Meteor.publish('pdfComments', function(pdfId) {
		//TODO: selective publish
		return PDFComments.find({});
	});
	Meteor.methods({
		addHighlight: function(selectData) {
			if(!Meteor.userId()) {
				throw new Meteor.Error('not authorized');
			}
			// Set user ID (ignore what user sent)
			selectData.uid = Meteor.userId();
			console.log('Adding highlight', selectData);	
			return PDFHighlights.insert(selectData, (error, id)=>{
				if(error) {
					console.log(error);
				}
			});
		},
		addComment: function(commentData) {
			if(!Meteor.userId()) {
				throw new Meteor.Error('not authorized');
			}
			commentData.uid = Meteor.userId();
			//TODO: validate comment data
			var id;
			return PDFComments.insert(commentData, (error, id)=>{
				if(error) {
					console.log(error);
				}
			});
		}
	});
	//Handle Authentication
	Accounts.validateNewUser(function(user) {
		console.log('Creating new user', user);
		return true;
	});
} else if (Meteor.isClient) {
	Meteor.subscribe('pdfs');
}
