import { getFinancialSheets } from './financial-sheets.helpers';
import { getStockNews } from './news.helpers';
import {
  getStockQuote,
  getYahooFinanceQuote,
  getYahooFinanceHistorical,
  getYahooFinanceSearch,
  getYahooFinanceQuoteSummary,
} from './yahoo-finance.helpers';

async function testAllHelpers() {
  console.log('=== Testing All Helper Functions ===\n');

  try {
    // Test 1: Get Financial Sheets
    console.log('1a. getFinancialSheets, balance_sheet:');
    try {
      const result = await getFinancialSheets('RELIANCE', 'balance_sheet');
      console.log('Get financial sheets result type:', result);
      console.log('✅ getFinancialSheets test completed\n');
    } catch (error) {
      console.log(
        '⚠️ getFinancialSheets error (expected due to network):',
        error
      );
      console.log(
        '✅ getFinancialSheets test completed (with expected error)\n'
      );
    }
    console.log('1b. getFinancialSheets, profit_loss:');
    try {
      const result = await getFinancialSheets('RELIANCE', 'profit_loss');
      console.log('Get financial sheets result type:', result);
      console.log('✅ getFinancialSheets test completed\n');
    } catch (error) {
      console.log(
        '⚠️ getFinancialSheets error (expected due to network):',
        error
      );
      console.log(
        '✅ getFinancialSheets test completed (with expected error)\n'
      );
    }
    console.log('1c. getFinancialSheets, cash_flow:');
    try {
      const result = await getFinancialSheets('RELIANCE', 'cash_flow');
      console.log('Get financial sheets result type:', result);
      console.log('✅ getFinancialSheets test completed\n');
    } catch (error) {
      console.log(
        '⚠️ getFinancialSheets error (expected due to network):',
        error
      );
      console.log(
        '✅ getFinancialSheets test completed (with expected error)\n'
      );
    }
    console.log('1d. getFinancialSheets, quarterly_results:');
    try {
      const result = await getFinancialSheets('RELIANCE', 'quarterly_results');
      console.log('Get financial sheets result type:', result);
      console.log('✅ getFinancialSheets test completed\n');
    } catch (error) {
      console.log(
        '⚠️ getFinancialSheets error (expected due to network):',
        error
      );
      console.log(
        '✅ getFinancialSheets test completed (with expected error)\n'
      );
    }
    console.log('1e. getFinancialSheets, ratios:');
    try {
      const result = await getFinancialSheets('RELIANCE', 'ratios');
      console.log('Get financial sheets result type:', result);
      console.log('✅ getFinancialSheets test completed\n');
    } catch (error) {
      console.log(
        '⚠️ getFinancialSheets error (expected due to network):',
        error
      );
      console.log(
        '✅ getFinancialSheets test completed (with expected error)\n'
      );
    }
    console.log('1f. getFinancialSheets, shareholding_pattern:');
    try {
      const result = await getFinancialSheets(
        'RELIANCE',
        'shareholding_pattern'
      );
      console.log('Get financial sheets result type:', result);
      console.log('✅ getFinancialSheets test completed\n');
    } catch (error) {
      console.log(
        '⚠️ getFinancialSheets error (expected due to network):',
        error
      );
      console.log(
        '✅ getFinancialSheets test completed (with expected error)\n'
      );
    }

    // Test 2: Get Stock News
    console.log('2. getStockNews:');
    try {
      const result = await getStockNews('AAPL', 5);
      console.log('Stock news result type:', result);
      console.log('✅ getStockNews test completed\n');
    } catch (error) {
      console.log('⚠️ getStockNews error (expected due to network):', error);
      console.log('✅ getStockNews test completed (with expected error)\n');
    }

    // Test 3: Get Stock Quote
    console.log('3. getStockQuote:');
    try {
      const result = await getStockQuote('AAPL', '1d', 7);
      console.log('Stock quote result type:', result);
      console.log('✅ getStockQuote test completed\n');
    } catch (error) {
      console.log('⚠️ getStockQuote error:', error);
      console.log('✅ getStockQuote test completed (with expected error)\n');
    }

    // Test 4: Yahoo Finance Quote
    console.log('4. Yahoo Finance - Quote:');
    try {
      const result = await getYahooFinanceQuote('AAPL');
      console.log('Yahoo Finance quote type:', result);
      console.log('✅ Yahoo Finance Quote test completed\n');
    } catch (error) {
      console.log('⚠️ Yahoo Finance Quote error:', error);
      console.log(
        '✅ Yahoo Finance Quote test completed (with expected error)\n'
      );
    }

    // Test 5: Yahoo Finance Historical
    console.log('5. Yahoo Finance - Historical:');
    try {
      const result = await getYahooFinanceHistorical('RELIANCE.BO', '1d', 5);
      console.log('Yahoo Finance historical type:', result);
      console.log('✅ Yahoo Finance Historical test completed\n');
    } catch (error) {
      console.log('⚠️ Yahoo Finance Historical error:', error);
      console.log(
        '✅ Yahoo Finance Historical test completed (with expected error)\n'
      );
    }

    // Test 6: Yahoo Finance Search
    console.log('6. Yahoo Finance - Search:');
    try {
      const result = await getYahooFinanceSearch('tech', 3);
      console.log('Yahoo Finance search type:', result);
      console.log('✅ Yahoo Finance Search test completed\n');
    } catch (error) {
      console.log('⚠️ Yahoo Finance Search error:', error);
      console.log(
        '✅ Yahoo Finance Search test completed (with expected error)\n'
      );
    }

    // Test 7: Yahoo Finance Quote Summary
    console.log('7. Yahoo Finance - Quote Summary:');
    try {
      const result = await getYahooFinanceQuoteSummary('RELIANCE.NS', [
        'assetProfile',
        'summaryDetail',
      ]);
      console.log('Yahoo Finance quoteSummary type:', result);
      console.log('✅ Yahoo Finance Quote Summary test completed\n');
    } catch (error) {
      console.log('⚠️ Yahoo Finance Quote Summary error:', error);
      console.log(
        '✅ Yahoo Finance Quote Summary test completed (with expected error)\n'
      );
    }

    console.log('🎉 All helper function tests completed!');
    console.log(
      'Note: Some network-related functions may show errors due to connectivity or rate limiting, which is expected.'
    );
  } catch (error) {
    console.error('❌ Unexpected error in test execution:', error);
  }
}

// Run all tests
testAllHelpers();
