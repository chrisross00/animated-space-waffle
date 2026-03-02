<template>
    <q-card class="bg-white">
        <!-- Dialog: Top Bar -->
        <q-bar class="bg-primary titlebar">
        <q-space />
        <q-btn dense flat icon="minimize" @click="maximizedToggle = false" :disable="!maximizedToggle">
            <q-tooltip v-if="maximizedToggle" class="bg-white text-primary">Minimize</q-tooltip>
        </q-btn>
        <q-btn dense flat icon="crop_square" @click="maximizedToggle = true" :disable="maximizedToggle">
            <q-tooltip v-if="!maximizedToggle" class="bg-white text-primary">Maximize</q-tooltip>
        </q-btn>
        <q-btn dense flat icon="close" v-close-popup>
            <q-tooltip class="bg-white text-primary">Close</q-tooltip>
        </q-btn>
        </q-bar>
        
<!-- TRANSACTION Body Form -->
        <div v-if="dialogType=='transaction'" class="dialog-body-form">
            <q-card-section>
                <div class="text-h3">Edit Transaction</div>
                <br />
                <div class="text-h4">$ {{item.amount}}</div>
            </q-card-section>

            <!-- Q-Form -->
                <div class="text-p">{{dialogBody.name}}</div>
                    <q-input
                        type="date"
                        filled
                        v-model="this.dialogBody.date"
                        lazy-rules
                        label="Date"
                        class="q-field--with-bottom"
                        @change="isFormSubmittable()"
                        />

                    <q-select
                        filled
                        v-model="this.dialogBody.mappedCategory"
                        label="Category Name"
                        :options="dropDownOptions"
                        class="q-field--with-bottom"
                        @touchmove.stop.prevent
                        />
                    <q-input
                        type="text"
                        filled
                        v-model="this.dialogBody.note"
                        lazy-rules
                        label="Note"
                        class="q-field--with-bottom"
                        @change="isFormSubmittable()"
                        />

                    <q-toggle
                        color="primary"
                        label="Exclude from Total"
                        v-model="this.dialogBody.excludeFromTotal"
                        @click="excludeFromTotal = !excludeFromTotal, isFormSubmittable()"/>

                    <q-toggle
                        v-if="this.dialogBody.merchantName || this.dialogBody.name"
                        color="secondary"
                        v-model="this.dialogBody.createRule"
                        :label="'Remember category for ' + (this.dialogBody.merchantName || this.dialogBody.name)"
                    />

                <div class="button-container">
                    <div>
                        <q-btn @click="updateTransaction" label="Submit" type="submit" color="primary" :disable="!formSubmittable"/>
                        <q-btn @click="resetData()" label="Reset" type="reset" color="secondary" flat class="q-ml-sm" />
                    </div>
                    <div>
                        <q-btn label="Cancel" v-close-popup color="accent"/>
                    </div>
                </div>
        </div>

<!-- EDIT CATEGORY Body Form -->
        <div v-if="dialogType=='editCategory'" class="dialog-body-form">
            <q-card-section>
                <div class="text-h3">Edit Category: {{this.dialogBody.originalCategoryName}}</div>
            </q-card-section>

            <!-- Q-Form -->
            <q-input
            filled
            v-model="this.dialogBody.categoryName"
            label="Category Name"
            lazy-rules
            :rules="[ val => val && val.length > 0 || 'Please type something']"
            @change="isFormSubmittable()"
            />

            <q-input
            filled
            type="number"
            v-model="this.dialogBody.monthly_limit"
            label="Monthly Limit"
            lazy-rules
            @change="isFormSubmittable()"
            :rules="[
                val => val !== null && val !== '' || 'Please enter a monthly limit',
            ]"
            />

            <q-toggle color="primary" :disable="true" label="Show on View Budgets screen" v-model="this.dialogBody.showOnBudgetPage" />

            <q-select
                filled
                v-model="this.dialogBody.plaid_pfc"
                label="Auto-map Plaid transaction types"
                :options="plaidPfcOptions"
                option-value="value"
                option-label="label"
                emit-value
                map-options
                multiple
                use-chips
                hint="Transactions Plaid labels with these types will be automatically assigned to this category."
                class="q-field--with-bottom q-mt-sm"
                @update:model-value="isFormSubmittable()"
            />

            <div class="button-container">
            <div>
                <q-btn @click="updateCategory" label="Submit" type="submit" color="primary" :disable="!formSubmittable"/>
                <q-btn @click="resetData()" label="Reset" type="reset" color="secondary" flat class="q-ml-sm" />
            </div>
            <div>
                <q-btn label="Cancel" v-close-popup  color="accent"/>
            </div>
            </div>
        </div>

<!-- ADD CATEGORY Body Form -->
        <div v-if="dialogType=='addCategory'" class="dialog-body-form">
            <q-card-section>
                <div class="text-h3">Add Category</div>
            </q-card-section>

            <!-- Q-Form -->

            <q-input
            filled
            v-model="this.dialogBody.categoryName"
            label="Category Name"
            lazy-rules
            :rules="[ val => val && val.length > 0 || 'Please type something']"
            @change="isFormSubmittable()"
            />

            <q-input
            filled
            type="number"
            v-model="this.dialogBody.monthly_limit"
            label="Monthly Limit"
            lazy-rules
            @change="isFormSubmittable()"
            :rules="[
                val => val !== null && val !== '' || 'Please enter a monthly limit',
            ]"
            />
            <q-select
                filled
                v-model="this.dialogBody.type"
                label="Category Type"
                :options="type"
                class="q-field--with-bottom"
                @touchmove.stop.prevent
                />

            <q-select
                filled
                v-model="this.dialogBody.plaid_pfc"
                label="Auto-map Plaid transaction types"
                :options="plaidPfcOptions"
                option-value="value"
                option-label="label"
                emit-value
                map-options
                multiple
                use-chips
                hint="Transactions Plaid labels with these types will be automatically assigned to this category."
                class="q-field--with-bottom q-mt-sm"
            />

            <div class="button-container">
            <div>
                <q-btn @click="addCategory" label="Submit" type="submit" color="primary" :disable="!formSubmittable"/>
                <q-btn @click="resetData()" label="Reset" type="reset" color="secondary" flat class="q-ml-sm" />
            </div>
            <div>
                <q-btn label="Cancel" v-close-popup  color="accent"/>
            </div>
            </div>
        </div>
    </q-card>
</template>

<style>

input .select{
    padding: 10px;
}

</style>

<script>
  import {ref} from 'vue'

  const PLAID_PFC_OPTIONS = [
    { label: 'Income',                   value: 'INCOME' },
    { label: 'Transfer In',              value: 'TRANSFER_IN' },
    { label: 'Transfer Out',             value: 'TRANSFER_OUT' },
    { label: 'Loan Payments',            value: 'LOAN_PAYMENTS' },
    { label: 'Bank Fees',                value: 'BANK_FEES' },
    { label: 'Food & Drink',             value: 'FOOD_AND_DRINK' },
    { label: 'General Merchandise',      value: 'GENERAL_MERCHANDISE' },
    { label: 'Home Improvement',         value: 'HOME_IMPROVEMENT' },
    { label: 'Medical',                  value: 'MEDICAL' },
    { label: 'Personal Care',            value: 'PERSONAL_CARE' },
    { label: 'General Services',         value: 'GENERAL_SERVICES' },
    { label: 'Government & Non-profit',  value: 'GOVERNMENT_AND_NON_PROFIT' },
    { label: 'Entertainment',            value: 'ENTERTAINMENT' },
    { label: 'Travel',                   value: 'TRAVEL' },
    { label: 'Transportation',           value: 'TRANSPORTATION' },
    { label: 'Rent & Utilities',         value: 'RENT_AND_UTILITIES' },
  ];

  export default {
      name: 'DialogComponent',
      props: {
        dialogType: {
          type: String,
          required: true,
        },
        item: {
          type: Object,
          required: false,
        },
        dropDown: {
            type: Array,
            required: false,
        }
      },
      data(){
        // console.log('beginning of data log: ', this.item)
        return {
            maximizedToggle: ref(true),
            editedTransaction: {},
            type: ['Expense', 'Income'],
            plaidPfcOptions: PLAID_PFC_OPTIONS,
            dialogBody:{
                amount: this.item?.amount ? this.item.amount : 0 ,
                name: this.item?.name ? this.item.name : '',
                monthly_limit: this.item?.monthly_limit ? this.item.monthly_limit : 0,
                showOnBudgetPage: this.item?.showOnBudgetPage ? this.item.showOnBudgetPage : true,
                date: this.item?.date ? this.item.date : '',
                transaction_id: this.item?.transaction_id ? this.item.transaction_id : '',
                merchantName: this.item?.merchant_name ? this.item.merchant_name : '',
                mappedCategory: this.item?.mappedCategory ? this.item.mappedCategory : '',
                categoryName: this.item?.categoryName ? this.item.categoryName : '',
                originalCategoryName: this.item?.categoryName ? this.item.categoryName : this.item?.mappedCategory ? this.item.mappedCategory : '',
                note: this.item?.note ? this.item.note : '',
                excludeFromTotal: this.item?.excludeFromTotal ? this.item.excludeFromTotal : false,
                plaid_pfc: this.item?.plaid_pfc ? [...this.item.plaid_pfc] : [],
                createRule: false,
                dialogType: this.dialogType
            },
            originalDialogBody: {},
            formSubmittable:false,
            initialData: null
        };
      },
      
computed: {
    dropDownOptions() {
        // let dropDown = this.dropDown
        const options = this.dropDown.map(item => item.category);

        // console.log('dropDownOptions =',this.dropDown)
        // console.log('options =',options)
        options.sort()
        return options
    }
  },
  methods: {
        onTransactionFormReset () {
            this.dialogBody = JSON.parse(JSON.stringify(this.initialData));
        },
        updateTransaction() {
            this.editedTransaction = {...this.dialogBody}
            // console.log('updateTransaction: edited Transaction: ', this.editedTransaction)
            this.$emit('update-transaction', this.editedTransaction)
        },
        updateCategory() {
            this.editedCategory = {...this.dialogBody, '_id': this.item._id, 'type': this.item.type}
            // console.log('update-category: edited Category: ', this.editedCategory)
            this.$emit('update-category', this.editedCategory)
        },
        addCategory() {
            this.addedCategory = {...this.dialogBody}
            console.log('add-Category: added Category: ', this.addedCategory)
            this.$emit('add-category', this.addedCategory)
        },
        buildEditCategoryDialog() {

        },
        resetData(){
            this.dialogBody = JSON.parse(JSON.stringify(this.initialData));
            this.formSubmittable = false
        },
        isFormSubmittable(){
            console.log('excludeFromTotal, ', this.dialogBody.excludeFromTotal, this.originalDialogBody.excludeFromTotal )
            // first evaluate for change
            if(this.dialogType == 'transaction'){
                if(
                    this.dialogBody.date !== this.originalDialogBody.date ||
                    this.dialogBody.mappedCategory !== this.originalDialogBody.mappedCategory || 
                    this.dialogBody.note !== this.originalDialogBody.note ||
                    this.dialogBody.excludeFromTotal !== this.originalDialogBody.excludeFromTotal 
                ){
                    this.formSubmittable = true
                }
                else{
                    this.formSubmittable = false
                }
            }

            if (this.dialogType == 'editCategory'){
                if (this.dialogBody.categoryName !== this.originalDialogBody.categoryName
                || this.dialogBody.monthly_limit !== this.originalDialogBody.monthly_limit
                || JSON.stringify(this.dialogBody.plaid_pfc) !== JSON.stringify(this.originalDialogBody.plaid_pfc)){
                    this.formSubmittable = true;
                }
                else{
                    this.formSubmittable = false;
                }
            }
            if (this.dialogType == 'addCategory'){
                if (this.dialogBody.categoryName !== ''
                || this.dialogBody.monthly_limit !== null){
                    this.formSubmittable = true;
                }
                else{
                    this.formSubmittable = false;
                }
            }
            return this.formSubmittable
        }
    },
    mounted(){
        this.originalDialogBody = Object.assign({}, this.dialogBody);
        console.log('mounted(): this.item ', this.item)
    },
    created() {
        this.initialData = JSON.parse(JSON.stringify(this.dialogBody));
        console.log('created child component dialog', this.originalDialogBody)
    },
    watch: {
        "dialogBody.mappedCategory": function (){
            this.isFormSubmittable()
        },
        "dialogBody.plaid_pfc": function (){
            this.isFormSubmittable()
        }
    }
  }
</script>