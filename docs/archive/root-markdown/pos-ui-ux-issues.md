# POS UI / UX Issues

## 1. Limited Product Filtering Options in Product Listing Area

**Current issue**  
In the product listing area, users currently have only a search box to find products. There are no additional filtering options such as category, brand, or product type. This makes product selection slower and less efficient, especially when the product catalog grows.

**Steps to observe**
1. Log in to the POS system.
2. Navigate to the sales/product listing screen.
3. Observe the top product search area.
4. Verify available filtering options.

**Current result**  
Only a search box is available for filtering products.

**Expected result**  
The system should provide additional filters to help users find products quickly, such as:
- Category dropdown
- Brand dropdown
- Product-based filter
- Stock status filter
- Sort option
- Clear filters option

---

## 2. Unnecessary Informational Messages Displayed in Opening Cash Confirmation Popup

**Current issue**  
The opening cash confirmation popup displays extra informational messages that should not appear in this dialog.

**Messages currently shown**
- Prefilled from the previous closing cash count. You can edit the notes and coins before starting the new shift.
- Once confirmed, the opening cash cannot be modified without manager approval. Please ensure the count is accurate.

**Expected result**  
These messages should not be displayed in the popup.  
The UI should remain clean and focused only on essential fields and actions.

---

## 3. Product Summary Section Not Displayed Properly on Products Page

**Current issue**  
The product summary section at the top of the Products page is not showing properly in the UI. The highlighted count cards appear misaligned and visually inconsistent with the surrounding layout.

**Expected result**  
The summary cards should be displayed properly with:
- Correct alignment
- Consistent spacing
- Proper visual structure matching the rest of the toolbar layout

---

## 4. Closed “Offline fallback ready” Banner Reappears Intermittently

**Current issue**  
The closed **“Offline fallback ready”** banner reappears again intermittently after being dismissed.

**Expected result**  
Once the banner is closed by the user, it should remain dismissed and should not reappear intermittently unless there is a valid system reason to show it again.

---

## 5. Selected Total Section Not Displayed Correctly in Change Breakdown Popup

**Current issue**  
The **Selected total** section is not displayed correctly in the **Change Breakdown** popup.

**Expected result**  
The **Selected total** section should be clearly visible, properly aligned, and visually consistent with the rest of the popup layout.
