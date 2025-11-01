# VES Pottery Studio Integration Guide

## About VES (www.ves.sg)

This pottery gallery extension is designed for VES, a Singapore-based pottery studio and store running on Shopify with a customized Dawn theme.

## Brand Identity

### Design Aesthetic
- **Minimalist & Clean**: Focuses on the pottery and craftsmanship
- **Artisanal**: Emphasizes handmade ceramics and workshops
- **Local**: Singapore-based pottery community

### Color Palette
- **Primary Black**: #121212 (text, headers)
- **Off-White**: #F5F3F0 (backgrounds)
- **White**: #FFFFFF (cards, clean spaces)
- **Neutral Grays**: Subtle borders and dividers

### Typography
- **Primary Font**: "Atak"
- **Fallback**: Assistant (sans-serif)
- **Style**: Clean, modern, readable

### Key Design Principles
1. Generous white space
2. Grid-based layouts
3. Product imagery takes center stage
4. Subtle interactions
5. Craft-focused aesthetic

## How the Gallery Integrates

### Automatic Theme Inheritance
The customer account extension automatically inherits:
- Your Atak font family
- VES color scheme (#121212, #F5F3F0)
- Spacing and layout consistency
- Overall brand aesthetic

### Design Alignment
✅ **Minimalist Layout**: Clean grid view of pottery pieces
✅ **Image Focus**: Large, clear pottery photos
✅ **White Space**: Proper spacing between elements
✅ **Neutral Palette**: Works with your black/off-white scheme
✅ **Professional**: Matches VES's artisanal positioning

## Deployment Checklist

### 1. Pre-Deployment
- [ ] Review sample-data.json structure
- [ ] Prepare pottery images (high quality, well-lit)
- [ ] Decide on clay types and tag taxonomy
- [ ] Enable customer accounts in Shopify

### 2. Metafield Setup
- [ ] Go to Settings > Custom data > Customers
- [ ] Create: `custom.design_projects` (JSON type)
- [ ] Test with sample data

### 3. Test Deployment
```bash
cd pottery-gallery-app
npm run dev
```
- [ ] Authenticate with VES Shopify account
- [ ] Add test pottery data to a customer
- [ ] Log in as customer and test all features
- [ ] Verify design matches VES aesthetic
- [ ] Test on mobile devices

### 4. Production Deployment
```bash
npm run deploy
```
- [ ] Deploy extension
- [ ] Activate in Shopify admin
- [ ] Test with real customer account

### 5. Content Management
- [ ] Train staff on adding pottery data
- [ ] Create workflow for new pieces
- [ ] Document clay types and glaze names
- [ ] Set up image hosting/CDN

## VES-Specific Customizations

### Pottery Courses at VES
Based on www.ves.sg, you likely offer:
- Wheel throwing workshops
- Hand-building classes
- Glazing techniques
- Ceramic courses

### Suggested Tag System
**Techniques**:
- wheel-thrown
- hand-built
- coil-built
- slab-built
- pinch-pot

**Skill Levels**:
- beginner
- intermediate
- advanced

**Types**:
- functional
- decorative
- sculpture
- tableware

**Firing**:
- bisque
- glaze-fired
- raku
- pit-fired

### Clay Types You Might Use
- Stoneware
- Porcelain
- Earthenware
- Terracotta
- Raku clay

(Adjust based on your actual clay inventory)

## Student Workflow at VES

### For Studio Staff
1. Student completes a piece in class
2. Piece goes through firing process
3. Staff photographs finished piece
4. Staff adds piece data to student's customer metafield
5. Student sees piece in their gallery

### For Students
1. Sign up for VES course/workshop
2. Create customer account
3. Complete pottery pieces
4. Log in to account to view portfolio
5. Share progress with friends/family

## Content Guidelines

### Photography Tips
- **Lighting**: Natural light or well-lit studio
- **Background**: Clean, neutral (matches VES aesthetic)
- **Angles**: Multiple views (top, side, detail shots)
- **Resolution**: High quality for zoom/detail viewing
- **Consistency**: Similar lighting/background across pieces

### Writing Student Notes
Encourage students to document:
- What they learned
- Challenges faced
- Techniques practiced
- Inspiration or meaning
- Future goals

### Glaze Names
Use your studio's glaze names consistently:
- "VES Celadon"
- "Copper Red #2"
- "Studio White"
- etc.

## Marketing Opportunities

### Social Proof
- Students can share their gallery
- Showcases course outcomes
- Builds community

### Course Marketing
- "Track your pottery journey"
- "Professional portfolio included"
- "Document your progress"

### Retention
- Students return to view their portfolio
- Encourages continued enrollment
- Creates emotional connection

## Technical Notes

### Performance
- Images load efficiently via Shopify CDN
- Filtering is instant (client-side)
- No impact on store performance

### Data Privacy
- Only visible to logged-in customer
- Controlled by is_public flag
- Can be hidden from gallery

### Scalability
- Handles hundreds of pieces per student
- Efficient filtering and search
- No load time issues

## Support for VES Team

### Adding New Pottery Pieces

**Via Shopify Admin**:
1. Customers > Select student
2. Find Metafields section
3. Edit `custom.design_projects`
4. Add new piece to JSON array
5. Save

**Via API** (for automation):
See README.md for API examples

### Troubleshooting

**Gallery not showing**:
- Check customer accounts enabled
- Verify extension deployed
- Confirm metafield exists

**Images not loading**:
- Use Shopify CDN URLs
- Ensure HTTPS
- Check image permissions

**Styling looks off**:
- Extension inherits Dawn theme
- Check Shopify theme settings
- Verify no conflicting CSS

## Future Enhancements for VES

### Phase 2 Ideas
- [ ] Public portfolio pages for sharing
- [ ] Course completion certificates
- [ ] Instructor feedback/comments
- [ ] Workshop calendar integration
- [ ] Clay & glaze inventory tracking
- [ ] Achievement badges system
- [ ] Progress timeline view
- [ ] Before/after comparisons
- [ ] Technique reference library
- [ ] Community gallery (opt-in)

### Automation Ideas
- [ ] Shopify Flow: Auto-add pieces on order fulfillment
- [ ] Email: Notify students when pieces added
- [ ] Instagram: Cross-post to social media
- [ ] Workshop signup: Create gallery on enrollment

## Contact & Support

For VES-specific setup questions:
1. Review README.md for complete documentation
2. Check QUICKSTART.md for deployment steps
3. Reference sample-data.json for data structure
4. Test with development store first

## Success Metrics

Track:
- Student engagement (logins to view gallery)
- Portfolio completeness (avg pieces per student)
- Social sharing (if implemented)
- Course retention (returning students)
- Marketing value (showcasing student work)

---

**The pottery gallery is production-ready and designed to seamlessly integrate with your VES brand aesthetic!**
