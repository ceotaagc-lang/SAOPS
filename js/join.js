// Join Form Handler
import { auth, db, storage, applicationsCollection, addDoc, ref, uploadBytes, getDownloadURL } from './firebase-config.js';

// Nigerian states
const NIGERIAN_STATES = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
    'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
    'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
    'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
    'Taraba', 'Yobe', 'Zamfara'
];

// Initialize form when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    initializeStatesGrid();
    initializeFormSteps();
    initializeContributionToggle();
    setupFormSubmit();
});

// Generate states checkboxes
function initializeStatesGrid() {
    const statesGrid = document.getElementById('statesGrid');
    if (!statesGrid) return;
    
    NIGERIAN_STATES.forEach(state => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.innerHTML = `
            <input type="checkbox" name="states" value="${state}">
            ${state}
        `;
        statesGrid.appendChild(label);
    });
}

// Multi-step form navigation
function initializeFormSteps() {
    const steps = document.querySelectorAll('.form-step');
    const progressSteps = document.querySelectorAll('.progress-step');
    let currentStep = 1;
    
    // Next buttons
    document.querySelectorAll('.btn-next').forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateStep(currentStep)) {
                showStep(currentStep + 1);
                currentStep++;
            }
        });
    });
    
    // Previous buttons
    document.querySelectorAll('.btn-prev').forEach(btn => {
        btn.addEventListener('click', () => {
            showStep(currentStep - 1);
            currentStep--;
        });
    });
    
    function showStep(step) {
        // Hide all steps
        steps.forEach(stepEl => {
            stepEl.classList.remove('active');
        });
        
        // Show current step
        document.querySelector(`.form-step[data-step="${step}"]`).classList.add('active');
        
        // Update progress indicators
        progressSteps.forEach((progressStep, index) => {
            const stepNum = index + 1;
            if (stepNum < step) {
                progressStep.classList.add('completed');
                progressStep.classList.remove('active');
            } else if (stepNum === step) {
                progressStep.classList.add('active');
                progressStep.classList.remove('completed');
            } else {
                progressStep.classList.remove('active', 'completed');
            }
        });
    }
    
    function validateStep(step) {
        const currentStepEl = document.querySelector(`.form-step[data-step="${step}"]`);
        const requiredFields = currentStepEl.querySelectorAll('[required]');
        let isValid = true;
        
        requiredFields.forEach(field => {
            if (!field.value || (field.type === 'checkbox' && !field.checked)) {
                isValid = false;
                field.style.borderColor = '#e74c3c';
                
                // Show error message
                let errorMsg = field.parentElement.querySelector('.error-message');
                if (!errorMsg) {
                    errorMsg = document.createElement('small');
                    errorMsg.className = 'error-message';
                    errorMsg.style.color = '#e74c3c';
                    field.parentElement.appendChild(errorMsg);
                }
                errorMsg.textContent = 'This field is required';
            } else {
                field.style.borderColor = '';
                const errorMsg = field.parentElement.querySelector('.error-message');
                if (errorMsg) errorMsg.remove();
            }
        });
        
        // Special validation for states checkboxes
        if (step === 1) {
            const statesSelected = document.querySelectorAll('input[name="states"]:checked').length;
            if (statesSelected === 0) {
                isValid = false;
                alert('Please select at least one state of operation');
            }
        }
        
        // Special validation for contributions (step 4)
        if (step === 4) {
            const contributionsSelected = document.querySelectorAll('input[name="contribution"]:checked').length;
            if (contributionsSelected === 0) {
                isValid = false;
                alert('Please select at least one way your organization will contribute');
            }
        }
        
        return isValid;
    }
}

// Toggle other contribution input
function initializeContributionToggle() {
    const otherCheckbox = document.querySelector('input[name="contribution"][value="other"]');
    const otherInput = document.getElementById('otherContribution');
    
    if (otherCheckbox && otherInput) {
        otherCheckbox.addEventListener('change', () => {
            otherInput.style.display = otherCheckbox.checked ? 'block' : 'none';
            if (!otherCheckbox.checked) {
                otherInput.value = '';
            }
        });
    }
}

// Setup form submission
function setupFormSubmit() {
    const form = document.getElementById('joinForm');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Show loading state
        const submitBtn = form.querySelector('.btn-submit');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        
        try {
            // Collect form data
            const formData = collectFormData();
            
            // Upload CAC certificate if provided
            const cacFile = document.getElementById('cacFile').files[0];
            let cacUrl = null;
            if (cacFile) {
                const storageRef = ref(storage, `cac_certificates/${Date.now()}_${cacFile.name}`);
                await uploadBytes(storageRef, cacFile);
                cacUrl = await getDownloadURL(storageRef);
            }
            
            // Create application document
            const applicationData = {
                ...formData,
                cacCertificateUrl: cacUrl,
                status: 'pending',
                submittedAt: new Date().toISOString(),
                xFollowVerified: false,
                secondaryFollowVerified: false,
                emailVerified: false,
                documentVerified: cacUrl ? true : false
            };
            
            // Save to Firestore
            const docRef = await addDoc(applicationsCollection, applicationData);
            
            // Send confirmation email (via serverless function)
            await sendConfirmationEmail(formData.officialEmail, formData.organizationName);
            
            // Show success message
            document.getElementById('joinForm').style.display = 'none';
            document.getElementById('formSuccess').style.display = 'block';
            document.getElementById('successEmail').textContent = formData.officialEmail;
            
            // Track in analytics
            if (typeof gtag !== 'undefined') {
                gtag('event', 'application_submitted', {
                    'organization': formData.organizationName,
                    'application_id': docRef.id
                });
            }
            
        } catch (error) {
            console.error('Error submitting application:', error);
            alert('There was an error submitting your application. Please try again or contact us if the problem persists.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}

// Collect all form data
function collectFormData() {
    // Get selected states
    const states = Array.from(document.querySelectorAll('input[name="states"]:checked'))
        .map(cb => cb.value);
    
    // Get contributions
    const contributions = Array.from(document.querySelectorAll('input[name="contribution"]:checked'))
        .map(cb => cb.value);
    
    // Check if other contribution was specified
    const otherContribution = document.getElementById('otherContribution');
    if (otherContribution && otherContribution.value) {
        contributions.push(`Other: ${otherContribution.value}`);
    }
    
    return {
        // Organization Info
        organizationName: document.getElementById('orgName')?.value,
        shortName: document.getElementById('shortName')?.value,
        cacNumber: document.getElementById('cacNumber')?.value,
        yearEstablished: parseInt(document.getElementById('yearEstablished')?.value),
        officialEmail: document.getElementById('officialEmail')?.value,
        phone: document.getElementById('phone')?.value,
        website: document.getElementById('website')?.value,
        statesOfOperation: states,
        primaryFocus: document.getElementById('primaryFocus')?.value,
        memberCount: document.getElementById('memberCount')?.value,
        
        // Leadership Info
        leaderName: document.getElementById('leaderName')?.value,
        leaderTitle: document.getElementById('leaderTitle')?.value,
        leaderEmail: document.getElementById('leaderEmail')?.value,
        leaderPhone: document.getElementById('leaderPhone')?.value,
        liaisonName: document.getElementById('liaisonName')?.value,
        liaisonTitle: document.getElementById('liaisonTitle')?.value,
        liaisonEmail: document.getElementById('liaisonEmail')?.value,
        liaisonPhone: document.getElementById('liaisonPhone')?.value,
        liaisonTelegram: document.getElementById('liaisonTelegram')?.value,
        liaisonSignal: document.getElementById('liaisonSignal')?.value,
        
        // Social Media
        xHandle: document.getElementById('xHandle')?.value,
        instagram: document.getElementById('instagram')?.value,
        facebook: document.getElementById('facebook')?.value,
        linkedin: document.getElementById('linkedin')?.value,
        telegramChannel: document.getElementById('telegramChannel')?.value,
        
        // Agreements
        charterAccepted: document.getElementById('charterAccepted')?.checked || false,
        nonPartisanAccepted: document.getElementById('nonPartisanAccepted')?.checked || false,
        confidentialityAccepted: document.getElementById('confidentialityAccepted')?.checked || false,
        secureCommsAccepted: document.getElementById('secureCommsAccepted')?.checked || false,
        
        // Contributions
        contributions: contributions,
        
        // Applicant info (for contact)
        applicantName: document.getElementById('liaisonName')?.value,
        applicantEmail: document.getElementById('liaisonEmail')?.value,
        applicantPhone: document.getElementById('liaisonPhone')?.value
    };
}

// Send confirmation email via serverless function
async function sendConfirmationEmail(email, orgName) {
    try {
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: email,
                subject: 'Application Received - Coalition for Democratic Pluralism',
                template: 'application_confirmation',
                data: {
                    organizationName: orgName,
                    reviewTime: '3-5 business days'
                }
            })
        });
        
        return await response.json();
    } catch (error) {
        console.error('Error sending email:', error);
        // Don't fail the application if email fails
        return null;
    }
}
