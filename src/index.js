const { ApolloServer, gql } = require('apollo-server');
const dotenv=require("dotenv");
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt= require("bcryptjs")
const jwt= require("jsonwebtoken");


dotenv.config();
const {DB_NAME, DB_URI,JWT_SECRET}= process.env;


const getToken = (user) => jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30 days' });

const getUserFromToken = async (token, db) => {
    if (!token) { return null }
  
    const tokenData = jwt.verify(token, JWT_SECRET);
    if (!tokenData?.id) {
      return null;
    }
    return await db.collection('Users').findOne({ _id: ObjectId(tokenData.id) });
  }

  

const typeDefs = gql`
type Query {

    myEmployeeList: [Employee!]!
    myEmployee(id: ID!): Employee!

}

type Mutation {

signUp(input: SignUpInput): AuthUser!
signIn(input: SignInInput): AuthUser!

createEmployee(firstName:String!,lastName:String!,age:Int!,address:String!,phoneNumber:String!): Employee!
updateEmployee(id: ID!,firstName:String!,lastName:String!,age:Int!,address:String!,phoneNumber:String!): Employee!
deleteEmployee(id: ID!): Boolean!

}

input SignUpInput {
    email: String!
    password: String!
    name: String!
    avatar: String
}

input SignInInput {
    email: String! 
    password: String! 
}

type AuthUser{
    user: User!
    token: String!
}


type User {
    id: ID!
    name: String!
    email: String! 
    avatar: String
    
}




type Employee {
    id: ID!
    firstName: String!
    lastName: String!
    age: Int!
    address: String!
    phoneNumber: String!
    users: [User!]!

}


`;



const resolvers = {
    Query: {
        myEmployeeList: async (_, __, { db, user }) => {
            if (!user) { throw new Error('Authentication Error. Please sign in'); }
      
            return await db.collection('Employee')
                                      .find({ userIds: user._id })
                                      .toArray();
          },

          myEmployee: async (_, {id}, { db,user }) => {
            if (!user) { throw new Error('Authentication Error. Please sign in'); }
      
            

                 return await db.collection('Employee').findOne({ _id: ObjectId(id) });

          },
        




    },  
    Mutation:{
        signUp: async (_,{input},{db})=>{
            const hashedPassword= bcrypt.hashSync(input.password);
            const newUser={
                    ...input,
                    password:hashedPassword
            };

          //  console.log("========================>",db)

            const options = { upsert: true, returnDocument: 'after' };
                //for MongoDB driver 4.x functions are returning only IDs so we need to get the object inserted by findOneAndUpdate function (only for debugging purposes)
            const result = await db.collection('Users').findOneAndUpdate(
                newUser,
                { $set: {} },
                options
                );
            const user= result.value
            //console.log(result.value);
                return {
                    user,
                    token:getToken(user)
                }
            
           
        },
        signIn: async (_, {input},{db})=>{

            const user= await db.collection("Users").findOne({email:input.email})
            const isPasswordValid =user && bcrypt.compareSync(input.password,user.password);

            //console.log(user)
            if(!user || !isPasswordValid){
                throw new Error("invalid credentials !!")
            }

           
            return {
            user,
            token:getToken(user)
        }
        },



        createEmployee: async(_, { firstName,lastName,age,address,phoneNumber }, { db, user }) => {
            if (!user) { throw new Error('Authentication Error. Please sign in'); } // prevent non logged in users to create employee list
      
            const newEmployee = {
                firstName,
                lastName,
                age,
                address,
                phoneNumber,
              createdAt: new Date().toISOString(),
              userIds: [user._id] // we can also add more ids (Hr managers for example as user) to crud this employee list
            }
           // const result = await db.collection('EmployeeList').insert(newEmployeeList);


            const options = { upsert: true, returnDocument: 'after' };

            const result = await db.collection('Employee').findOneAndUpdate(
                newEmployee,
                { $set: {} },
                options
                );


            //console.log(result.value)
            return result.value;
          },




          updateEmployee: async(_, { id,firstName,lastName,age,address,phoneNumber }, { db, user }) => {
            if (!user) { throw new Error('Authentication Error. Please sign in'); }
      
            const result = await db.collection('Employee')
                                  .updateOne({
                                    _id: ObjectId(id)
                                  }, {
                                    $set: {
                                        firstName,lastName,age,address,phoneNumber
                                    }
                                  })
            
            return await db.collection('Employee').findOne({ _id: ObjectId(id) });
          },


          deleteEmployee: async(_, { id }, { db, user }) => {
            if (!user) { throw new Error('Authentication Error. Please sign in'); }
            
            await db.collection('Employee').deleteOne({ _id: ObjectId(id) });
      
            return true;
          },






    },
    User:{
        id:({_id,id})=>_id || id
    },
    Employee:{
        id:({_id,id})=>_id || id,
        users: async ({ userIds }, _, { db }) => Promise.all(
            userIds.map((userId) => (
              db.collection('Users').findOne({ _id: userId}))
            )
          ),
    }
  };



  const start = async ()=>{
    const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    const db = client.db(DB_NAME);
    //console.log("====================>>>>",db)

    const server = new ApolloServer({ typeDefs, resolvers,context: async ({req})=>{
        const user = await getUserFromToken(req.headers.authorization, db);

     
        return {
            db,
            user
        }
       

    },
    
    
    });

    server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
    });
  }

start();
