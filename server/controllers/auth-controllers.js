require('dotenv').config();
const bcrypt = require("bcryptjs");
const { User, Product, CsvData } = require('../models/user-models')
const axios = require('axios');

// for csv file upload
const fs = require('fs');
const csv = require('fast-csv');

const userRegister = async (req, res) => {
    try {
        const existingUser = await User.findOne({ email: req.body.email });
        if (existingUser) {
            return res.status(409).send("User already exists");
        }
        const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            password: req.body.password,
            role: req.body.role
        });
        await newUser.save();
        return res.status(200).send("User registered")
    }
    catch (error) {
        console.error("Error:", error);
        return res.status(500).send("Internal server error");
    }
}

const userLogin = async (req, res) => {
    try {
        const userValid = await User.findOne({ email: req.body.email });
        if (userValid) {
            const detailsMatch = await bcrypt.compare(req.body.password, userValid.password)
            if (!detailsMatch) {
                return res.status(401).send("Invalid credentials");
            } else {

                const token = await userValid.generateToken();
                res.cookie("userCookie", token, {
                    expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    httpOnly: true,
                    sameSite: "Lax",
                    secure: true
                });
                return res.status(200).send({ userValid })
            }

        } else {
            return res.status(404).send("User not found");
        }
    } catch (error) {
        return res.status(500).send(error)
    }
}

const validateUser = async (req, res) => {
    try {
        let user = await User.findOne({ _id: req.userId });
        res.status(200).send(user);
    } catch (error) {
        res.status(401).send("user not found");
    }
}

const logoutUser = async (req, res) => {
    try {
        res.clearCookie('userCookie');
        res.status(200).send({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(401).send({ message: 'error in Logged out' });
    }
}

const updatePassword = async (req, res) => {
    const { newPassword } = req.body;
    try {
        const user = req.validUser;
        user.password = newPassword;
        await user.save();
        res.status(200).send('Password updated successfully.');
    } catch (error) {
        console.error(error);
        res.status(500).send('error in updating password');
    }
};

const updateUser = async (req, res) => {
    const {_id,name,email,newPassword} = req.body;
    const data = {}
    data._id = _id
    if(name) data.name = name
    if(email) data.email = email

    try {
        if (newPassword) {
            data.password = await bcrypt.hash(newPassword, 12);
        }
        const updateUser = await User.findByIdAndUpdate( 
            data._id,
            { $set: data},
            { new: true, runValidators: true }
        )
        if (!updateUser) {
            return res.status(404).send('user not found');
        }
        res.status(200).send('User updated successfully');
    } catch (error) {
        res.status(500).send('error in updating user', error)
    }
}

const getUsers = async (req, res) => {
    try {
        const response = await User.find();
        if (!response) {
            return res.status(401).send('no user found')
        }
        res.status(200).send(response)
    } catch (error) {
        console.log('errer in getting user', error)
        res.status(500).send(error)
    }
}

const deleteUser = async (req,res)=>{
    const email = req.body.email
    console.log(email)
    try {
        const user = await User.findOneAndDelete({email:email});
        if(!user){
            return res.status(404).send('user not found')
        }
        res.status(200).send('User deleted successfully')
    } catch (error) {
        console.log('error in deleting user')
        res.status(500).send('error deleting user',error)
    }
}

const syncProductFromShopify = async (req, res) => {
    try {
        const apiKey = process.env.STORE_API_KEY;
        const password = process.env.STORE_API_PASSWORD;
        const apiUrl = process.env.STORE_API_URL;

        const response = await axios.get(`${apiUrl}/products.json`, {
            auth: {
                username: apiKey,
                password: password
            }
        });

        const productsData = response.data.products;

        // Sync each product and store it in the database
        await Promise.all(productsData.map(async (productData) => {
            // Prepare product data to be inserted or updated
            const productFields = {
                productId: productData.id,  // Use Shopify product ID
                title: productData?.title ?? 'Unknown Title',
                handle: productData?.handle ?? 'Unknown Handle',
                image_src: productData?.image?.src ?? '',
                images: productData?.images ?? [],
                tags: productData?.tags ?? [],
                variants: productData?.variants?.map((variant) => ({
                    id: variant.id,
                    sku: variant.sku,
                    price: variant.price,
                    compare_at_price: variant.compare_at_price,
                    image_id: variant.image_id
                })) ?? []
            };

            // Check if product already exists and has changed, else create a new one
            await Product.findOneAndUpdate(
                { productId: productData.id },  // Check if product exists by Shopify ID
                productFields,                  // Update fields if different
                { upsert: true, new: true }     // Insert if not found, return updated document
            );
        }));

        res.status(200).send('All products synced successfully.');
    } catch (error) {
        console.error('Error syncing data:', error);
        res.status(500).json({ error: 'Failed to sync products' });
    }
};


const deleteProductFromDb = async (req, res) => {
    try {
        await Product.deleteMany({});
        res.status(200).send('All products deleted successfully.')
    } catch (error) {
        console.log('Error deleting products:', error);
        res.status(500).send('Failed to delete products')
    }
};

function getYearsInRange(startYear, endYear) {
    const years = [];
    for (let year = parseInt(startYear); year <= parseInt(endYear); year++) {
        years.push(year.toString());
    }
    return years;
}
async function insertBatch(batch, batchNumber) {
    console.log(`Inserting batch ${batchNumber} with ${batch.length} records.`);
    await CsvData.insertMany(batch);
    console.log(`Batch ${batchNumber} inserted successfully.`);
}
const BATCH_SIZE = 10000;
let batchNumber = 0;
let totalRecords = 0;

// function to save csv product to db in batch
async function processCsvFile(filePath) {
    let batch = []; // Array to hold the batch

    const stream = fs.createReadStream(filePath);
    const csvStream = csv.parse({ headers: true })
        .transform(data => {
            const transformed = {
                make: data.make.trim(),
                model: data.model.trim(),
                year: getYearsInRange(data.start_year, data.end_year),
                engineType: `${data.engine.trim()}`,
                sku: data.sku.trim(),
                bhp: data.bhp.trim(),
                caliper: data.caliper.trim(),
                discDiameter: data.disc_diameter.trim(),
                included: data.Included ? data.Included.split(',').map(item => item.trim()) : [],
                carEnd: data.car_end.trim(),
            };
            return transformed;
        })

        .on('error', error => console.error('Error reading CSV:', error))
        .on('data', async (row) => {
            batch.push(row);

            if (batch.length >= BATCH_SIZE) {
                csvStream.pause(); // Pause the stream to manage flow control
                batchNumber++;
                // Asynchronously insert the batch
                insertBatch(batch, batchNumber).then(() => {
                    batch = []; // Clear the batch after successful insertion
                    csvStream.resume(); // Resume the stream
                }).catch(error => {
                    console.error(`Error inserting batch ${batchNumber}:`, error);
                    csvStream.resume(); // Optionally continue processing after a failed insert
                });
            }
        })
        .on('end', () => {
            // Handle the last batch
            if (batch.length > 0) {
                batchNumber++;
                insertBatch(batch, batchNumber).then(() => {
                    console.log(`Final batch ${batchNumber} inserted.`);
                }).catch(error => {
                    console.error(`Error inserting final batch ${batchNumber}:`, error);
                });
            }
            console.log('CSV file has been processed successfully.');
        });

    stream.pipe(csvStream);
}

async function countCsvRows(filePath) {
    return new Promise((resolve, reject) => {
        let rowCount = 0;
        fs.createReadStream(filePath)
            .pipe(csv.parse({ headers: true }))  // Parse CSV with headers
            .on('data', (row) => {
                rowCount++;
            })
            .on('end', () => {
                console.log(`Total batches: ${rowCount / 10000}`);
                resolve(rowCount);
            })
            .on('error', reject);  // Handle any errors
    });
}

const uploadCsvData = async (req, res) => {
    batchNumber = 0;
    totalRecords = 0;
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    totalRecords = await countCsvRows(req.file.path);
    try {
        // Assume a function processCsvFile that processes your CSV file
        await processCsvFile(req.file.path);
        res.status(200).send('csv uploaded successfully.');
    } catch (error) {
        console.log('Error uploading csv:', error);
        res.status(500).send('Error uploading csv');
    }
};

const progress = async (req, res) => {

    if (totalRecords > 0) {
        res.json({
            status: 'processing',
            progress: batchNumber,
            total: totalRecords / 10000
        });
    } else {
        res.json({
            status: 'complete',
            progress: totalRecords
        });
    }
}

const deleteCsvData = async (req, res) => {
    try {
        await CsvData.deleteMany({});
        res.status(200).send('Csv data deleted successfully.')
    } catch (error) {
        console.error('Error deleting csv data:', error);
        res.status(500).send('Failed to delete csv data')
    }
};

const getCsvData = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;  // Default and maximum rows per page
    const skip = (page - 1) * limit;
    const search = req.query.search;
    // Build the query object
    let query = {};
    if (search) {
        query = {
            $or: [
                { make: new RegExp(search, 'i') },
                { model: new RegExp(search, 'i') },
                { engineType: new RegExp(search, 'i') },
                // You can add more fields to search in:
                { sku: new RegExp(search, 'i') }
            ]
        };
    }
    try {
        // Find documents based on the query
        const csvData = await CsvData.find(query)
            .skip(skip)
            .limit(limit);

        // Count only the documents that match the query
        const total = await CsvData.countDocuments(query);

        res.status(200).send({
            total,
            data: csvData,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching csv data:', error);
        res.status(500).json({ error: 'Failed to fetch csv data' });
    }
};


const getCsvDataMakes = async (req, res) => {
    try {
        const uniqueMakes = await CsvData.aggregate([
            { $group: { _id: "$make" } }, // Group documents by "make" field
            { $project: { _id: 0, make: "$_id" } } // Project the "make" field without _id
        ]);
        res.status(200).send(uniqueMakes)
    } catch (error) {
        console.error('Error fetching unique makes:', error);
        res.status(500).json({ error: 'Failed to fetch unique makes' });
    }
}

const getCsvDataModels = async (req, res) => {
    try {
        // Extract the selected make value from the query parameters
        const selectedMake = req.query.make;

        // Check if the selected make is provided
        if (!selectedMake) {
            return res.status(400).json({ error: 'Selected make is required' });
        }

        // Perform aggregation to get unique models for the selected make
        const uniqueModels = await CsvData.aggregate([
            { $match: { make: selectedMake } }, // Filter documents by selected make
            { $group: { _id: "$model" } }, // Group documents by "model" field
            { $project: { _id: 0, model: "$_id" } } // Project the "model" field without _id
        ]);

        res.status(200).send(uniqueModels.map(item => item.model))
    } catch (error) {
        console.error('Error fetching unique models:', error);
        res.status(500).json({ error: 'Failed to fetch unique models' });
    }
}

const getCsvDataYears = async (req, res) => {
    try {
        // Extract the selected model and make values from the query parameters
        const selectedModel = req.query.model;
        const selectedMake = req.query.make;

        // Check if the selected model and make are provided
        if (!selectedModel || !selectedMake) {
            return res.status(400).json({ error: 'Selected model and make are required' });
        }

        // Perform aggregation to get unique years for the selected model
        const years = await CsvData.aggregate([
            { $match: { model: selectedModel, make: selectedMake } },
            { $group: { _id: "$year" } }, // Group documents by "startYear" field
            { $project: { _id: 0, year: "$_id" } } // Project the "startYear" field without _id
        ]);

        res.status(200).send(years)
    } catch (error) {
        console.error('Error fetching unique start and end years:', error);
        res.status(500).json({ error: 'Failed to fetch unique start and end years' });
    }
}

const getCsvDataEngineTypes = async (req, res) => {
    try {
        const selectedModel = req.query.model;
        const selectedMake = req.query.make;
        const selectedYear = req.query.year;

        // Check if the engine is provided
        if (!selectedMake || !selectedModel || !selectedYear) {
            return res.status(400).json({ error: 'year is required' });
        }

        // Perform aggregation to get unique engine types for the selected year
        const uniqueEngineTypes = await CsvData.aggregate([
            { $match: { model: selectedModel, make: selectedMake, year: selectedYear } },
            { $group: { _id: "$engineType" } },
            { $project: { _id: 0, engineType: "$_id" } }
        ]);

        res.status(200).send(uniqueEngineTypes)
    } catch (error) {
        console.error('Error fetching unique engine types:', error);
        res.status(500).json({ error: 'Failed to fetch unique engine types' });
    }
}

const getRealTimeInventoryStatus = async (variantId) => {
    try {
        const apiKey = process.env.STORE_API_KEY;
        const password = process.env.STORE_API_PASSWORD;
        const apiUrl = process.env.STORE_API_URL;
        const response = await axios.get(`${apiUrl}/variants/${variantId}.json`, {
            auth: {
                username: apiKey,
                password: password
            }
        });
        const realTimeVariantData = response.data.variant;
        return realTimeVariantData;

    } catch (error) {
        console.error('Error fetching real-time inventory status:', error);
        return null;
    }
};

const getCsvDataSku = async (req, res) => {
    try {

        const sku = req.query.sku;
        const selectedModel = req.query.model;
        const selectedMake = req.query.make;
        const selectedYear = req.query.year;
        const selectedEngineType = req.query.engine_type;
        if (!sku) {
            return res.status(400).json({ error: 'SKU is required' });
        }
        const [CsvOptions, product] = await Promise.all([
            CsvData.findOne({ sku: sku, model: selectedModel, make: selectedMake, year: selectedYear, engineType: selectedEngineType }),
            Product.findOne({ 'variants.sku': sku })
        ]);

        let realTimeVariant;
        const variant = product.variants.filter(variant => variant.sku === sku);

        if (variant) {
            realTimeVariant = await getRealTimeInventoryStatus(variant[0].id);
        }

        const response = {
            query: CsvOptions,
            product: product,
            stock: realTimeVariant.inventory_quantity,
            continueSelling: realTimeVariant.inventory_policy
        };

        res.status(200).send(response)
    } catch (error) {
        console.error('Error fetching products by SKU:', error);
        res.status(500).send('Failed to fetch products');
    }
}

const getCsvDataSkus = async (req, res) => {
    try {
        const selectedModel = req.query.model;
        const selectedMake = req.query.make;
        const selectedYear = req.query.year;
        const selectedEngineType = req.query.engine_type;

        // Check all values are provided
        if (!selectedMake || !selectedModel || !selectedYear || !selectedEngineType) {
            return res.status(400).json({ error: 'Engine type is required' });
        }

        // Perform aggregation to get unique SKUs for the selected dropdown values
        const uniqueSKUs = await CsvData.aggregate([
            { $match: { model: selectedModel, make: selectedMake, year: selectedYear, engineType: selectedEngineType } },
            { $group: { _id: "$sku" } },
            { $project: { _id: 0, sku: "$_id" } }
        ]);

        res.status(200).send(uniqueSKUs)
    } catch (error) {
        console.error('Error fetching unique SKUs:', error);
        res.status(500).send('Failed to fetch unique SKUs')
    }
}

const getProductsBySkus = async (req, res) => {
    try {
        const skus = req.query.sku;

        // Check if SKU query parameter is provided
        if (!skus) {
            return res.status(400).send('SKU is required')
        }

        const skuArray = skus.split(','); // Split the SKU query param into an array

        // Find products by variant SKU using $in to handle multiple SKUs
        const products = await Product.find({ variantSku: { $in: skuArray } });

        // Check if products exist
        if (!products.length) {
            return res.status(404).send('No products found with the provided SKU(s)')
        }

        // Return the products
        res.status(200).send(products)
    } catch (error) {
        console.error('Error fetching products by SKU:', error);
        res.status(500).send('Failed to fetch products')
    }
}

const deleteMultipleRows = async (req, res) => {
    try {
        const rowId = req.body.ids;
        if (!Array.isArray(rowId) || rowId.length === 0) {
            return res.status(400).send('Invalid or no IDs provided');
        }
        const result = await CsvData.deleteMany({
            _id: { $in: rowId }
        });
        if (result.deletedCount === 0) {
            return res.status(404).send('No row found to delete');
        }
        return res.status(200).send(`${result.deletedCount} csv data deleted successfully`);
    } catch (error) {
        console.error('Error deleting csv data:', error);
        res.status(500).send('Error deleting csv data');
    }
}

const updateRow = async (req, res) => {
    try {
        const data = req.body;
        const updatedRow = await CsvData.findByIdAndUpdate(
            data._id,
            {
                $set: {
                    make: data.make,
                    model: data.model,
                    year: data.year,
                    engineType: data.engineType,
                    sku: data.sku,
                    bhp: data.bhp,
                    caliper: data.caliper,
                    discDiameter: data.discDiameter,
                    included: data.included,
                    carEnd: data.carEnd
                }
            },
            { new: true, runValidators: true }
        )
        if (!updatedRow) {
            return res.status(404).send('row not found');
        }

        res.status(200).send('row data updated successfully');
    } catch (error) {
        console.error('Error in row data:', error);
        res.status(500).send('Error updating row data');
    }
}

const addRow = async (req, res) => {
    const data = req.body;
    try {
        const newRow = new CsvData({
            make: data.make,
            model: data.model,
            year: getYearsInRange(data.startYear, data.endYear),
            engineType: data.engineType,
            sku: data.sku,
            bhp: data.bhp,
            caliper: data.caliper,
            discDiameter: data.discDiameter,
            included: data.included.split(','),
            carEnd: data.carEnd
        });

        await newRow.save()
        return res.status(201).send('new row added')

    } catch (error) {
        console.log('error in adding new row data', error)
        return res.status(500).send('error in adding new row data')
    }
}

module.exports = {
    validateUser,
    userLogin,
    userRegister,
    logoutUser,
    updatePassword,
    getUsers,
    syncProductFromShopify,
    deleteProductFromDb,
    uploadCsvData,
    deleteCsvData,
    getCsvData,
    getCsvDataMakes,
    getCsvDataModels,
    getCsvDataYears,
    getCsvDataEngineTypes,
    getCsvDataSku,
    getCsvDataSkus,
    getProductsBySkus,
    deleteMultipleRows,
    updateRow,
    addRow,
    progress,
    updateUser,
    deleteUser
}; 