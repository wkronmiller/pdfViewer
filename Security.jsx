Security = {};

/* Initialize Security Groups */
Security.userGroups = {};

Security.userGroups.admin = {};
Security.userGroups.admin.users = [{casId:'KRONMW', roles:[]}];

Security.userGroups.wcl = {};
Security.userGroups.wcl.users = [
  {casId:'KRONMW', roles:[]},
  {casId:'IMAIS', roles:[]}
];

Security.initGroups = function initGroups() {
  //TODO: remove permissions
  for(var userGroupName in Security.userGroups) {
    var userGroup = Security.userGroups[userGroupName];
    userGroup.users.forEach(function(user) {
      var matchingUsers = Accounts.users.find({'services.cas.id': user.casId}).fetch();
      if(matchingUsers.length == 1) {
        var userId = matchingUsers[0]._id;
        Roles.addUsersToRoles(userId, user.roles, userGroupName);
      } else {
        console.log('Problem initializing user', user, matchingUsers);
      }
    });
  }
};
