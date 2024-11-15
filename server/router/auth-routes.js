const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const Controler = require('../controllers/auth-controllers');
const authenticate = require('../middlewares/authenticate');

router.post('/user-register',Controler.userRegister);
router.post('/user-login',Controler.userLogin);
router.get('/validate-user',authenticate,Controler.validateUser);
router.post('/logout',authenticate,Controler.logoutUser);
router.put('/change-password',authenticate,Controler.updatePassword);
router.get('/get-users',Controler.getUsers)
router.put('/update-user',Controler.updateUser)
router.post('/delete-user',Controler.deleteUser)


router.post('/upload-csv',upload.single('csvFile'),Controler.uploadCsvData);
router.post('/delete-csv',Controler.deleteCsvData);
router.delete('/delete-rows',Controler.deleteMultipleRows)
router.put('/update-row',Controler.updateRow)
router.post('/add-row',Controler.addRow)

router.get('/csv-data',Controler.getCsvData);
router.get('/csv-data-makes',Controler.getCsvDataMakes);
router.get('/csv-data-models',Controler.getCsvDataModels);
router.get('/csv-data-years',Controler.getCsvDataYears);
router.get('/csv-data-engineTypes',Controler.getCsvDataEngineTypes);
router.get('/csv-data-sku',Controler.getCsvDataSku);
router.get('/csv-data-skus',Controler.getCsvDataSkus);

router.post('/sync-products',Controler.syncProductFromShopify);
router.post('/delete-products',Controler.deleteProductFromDb);
router.get('/products-skus',Controler.getProductsBySkus);

router.get('/upload/progress',Controler.progress)
module.exports = router; 