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

PDFUserdata = new Mongo.Collection('pdfUserData');
 
if(Meteor.isServer) {
  PDFs.allow({
    'insert': function() {
      return true;
    },
    download: function() {
      return true;
    }
  });
  Meteor.publish('pdfs', function() {
    var shareQuery = {};
    shareQuery['meteadata.shareWith.' + String(this.userId)] = true;
    //shareQuery['metedata.shareWith.' + String(this.user().profile.name)] = true; //TODO
    var queries = [
      {'metadata.creatorId': this.userId},
      shareQuery];
    var groups = Roles.getGroupsForUser(this.userId);
    for(var idx in groups) {
      shareQuery = {};
      shareQuery['metadata.shareWith.' + String(groups[idx])] = true;
      queries.push(shareQuery);
    }
    return PDFs.find({$or: queries});
  });
  Meteor.publish('pdfHighlights', function(pdfId) {
    //TODO: only publish current PDF
    console.log('Publishing highlights for document', pdfId);
    return PDFHighlights.find({docId:pdfId});
  });
  Meteor.publish('pdfComments', function(pdfId) {
    //TODO: selective publish
    return PDFComments.find({docId:pdfId});
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
    },
    sharePDF: function(pdfId, shareTarget) {
      var uid = Meteor.userId();
      if(!uid) {
        throw new Meteor.Error(403, 'User must be authenticated');
      }
      // Get PDF
      var pdf = PDFs.findOne({_id: pdfId});
      if(!pdf) {
        throw new Meteor.Error(404, 'PDF Not found');
      }
      if(pdf.metadata.creatorId !== uid) {
        throw new Meteor.Error(403, 'Only the creator of a PDF can share it');
      }
      // Update sharing property
      //PDFs.update({$and: [{_id:pdfId}, {'metadata.shareWith':{$exists:false}}]}, {$set:{'metadata.shareWith':{}}});
      var shareString = 'metadata.shareWith.' + String(shareTarget);
      var shareQuery = {};
      shareQuery[shareString] = true;
      console.log('Updating PDF with query', shareQuery);
      PDFs.update({_id: pdfId}, {$set: shareQuery}, function(error, numAffected) {
        if(error) {
          console.log(error);
          throw new Meteor.Error('Failed to update PDF');
        }
        console.log(numAffected);
      });
      return 'Updating share';
    }
  });
  //Handle Authentication
  var checkCas = function(user) {
    // Ensure new user is created through CAS authentication
    if(!user.services || !user.services.cas) {
      throw new Meteor.Error(403, "User must be authenticated through CAS");
    } else {
      console.log('Allowing user', user);
      return true;
    }
  };
  Accounts.validateNewUser(checkCas);
  Accounts.validateLoginAttempt(function(attemptInfo) {
    console.log('Login attempt', attemptInfo);
    if(attemptInfo.allowed) {
      if(attemptInfo.type === 'cas' ||
        attemptInfo.type === 'resume') {
        return true;
      }
    }
    return false;
  });

  //Initialize security groups
  Security.initGroups();

} else if (Meteor.isClient) {
  Meteor.subscribe('pdfs');
}
